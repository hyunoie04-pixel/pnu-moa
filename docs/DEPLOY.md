# 모아 v10 — 정적 공고 내장 및 자동 빌드·배포 안내

이 문서는 모아 사이트가 평소 방문마다 Supabase에서 공고 전체(`notices`, `site_meta`)를 읽지 않고, 빌드 시점에 내장한 공고(`snapshot`)를 기본으로 사용하도록 전환하는 방법과 GitHub Actions 자동 빌드·배포 설정 절차를 안내합니다.

---

## 1. 저장소에 올릴 파일 목록과 위치

저장소 루트 기준으로 아래 위치에 파일을 반영합니다.

| 저장소 내 경로 | 원본(검토본) 파일 | 역할 |
| :--- | :--- | :--- |
| `site/template.html` | `v10/template.v10.html` | `/*SNAPSHOT_AT*/` 자리 표시자와 `SNAPSHOT_STALE_HOURS=6` 신선도 판별이 적용된 사이트 템플릿 |
| `site/build.py` | `v10/build.py` | 시트 수집 시각(`SNAPSHOT_AT`) 기록, `snapshot.meta.json` 저장, 빈 시트·비정상 축소 방어가 추가된 빌드 스크립트 |
| `site/origin_rules.json` | `v10/ref/origin_rules.json` | 교내/교외 분류 규칙이며, 규칙을 바꾸면 이 파일을 갱신해 다시 빌드됩니다 |
| `.github/workflows/build-and-deploy.yml` | `v10/deploy/build-and-deploy.yml` | 매시간 시트를 읽어 `site/index.html`을 빌드하고 GitHub Pages로 배포하는 워크플로 |

참고 파일(기존 그대로 유지):
- `site/admin/index.html` (관리자 화면 — 배포 시 `_site/admin/index.html`로 함께 복사됨)
- `collector/data/sources_seed.csv`, `collector/data/departments_extra.csv` (`site/build.py`가 단과대학·학과 목록을 만들 때 읽음)

> 구글 스프레드시트는 공개 읽기 상태이므로 워크플로에 별도의 비밀 값(Secret·토큰·API 키)을 등록할 필요가 없습니다.

---

## 2. 저장소 설정에서 바꿀 것 (GitHub Pages)

1. GitHub 저장소 상단 메뉴에서 **Settings** → 왼쪽 메뉴 **Pages**로 이동합니다.
2. **Build and deployment** 아래의 **Source**를 기존 `Deploy from a branch`에서 **`GitHub Actions`**로 변경합니다.

---

## 3. 첫 실행 및 확인 방법

1. 위 파일들을 `main` 브랜치에 푸시하거나, GitHub 저장소의 **Actions** 탭 → **Build and Deploy MOA Pages** 워크플로 선택 → 오른쪽 **Run workflow** 버튼을 눌러 수동 실행합니다.
2. 워크플로의 `Build site with live Google Sheet snapshot` 단계 로그에 다음과 같이 행 수와 수집 시각이 출력되는지 확인합니다:
   ```text
   built site/index.html | rows ... | snapshot_at 2026-...+09:00 | colleges ... | bytes ...
   ```
3. 배포가 끝난 뒤 사이트에 접속하여:
   - 상단 상태 문구가 **`공고 기준 · M월 D일 HH:MM`** 형식으로 즉시 표시되는지 확인합니다.
   - 브라우저 개발자 도구(Network 탭)에서 `/rest/v1/notices` 및 `/rest/v1/site_meta` 요청이 발생하지 않는지 확인합니다(관심 TOP5·TOP3 조회 RPC와 통계·의견 전송은 기존과 동일하게 동작합니다).
   - 서버 직접 읽기를 점검하고 싶을 때는 주소 뒤에 **`?live=1`**을 붙여 접속하면 내장본이 신선하더라도 즉시 Supabase 서버에서 읽어 **`최신 공고 · M월 D일 HH:MM 갱신`**으로 표시됩니다.

---

## 4. 알려진 한계 및 운영 참고 사항

- **GitHub Actions 예약 실행(cron) 자동 중지 가능성 (확인 필요)**: 공개/비공개 저장소에서 일정 기간(보통 60일) 동안 커밋 등 저장소 활동이 전혀 없으면 GitHub가 예약 워크플로(`schedule`)를 자동으로 일시 중지할 수 있습니다. 주기적으로 Actions 탭에서 예약 실행 여부를 확인하거나 비활성화 알림 이메일을 확인해 주세요.
- **시트 읽기 실패 또는 비정상 행 수일 때 동작**:
  - `site/build.py`가 시트에서 읽은 공고가 **0건**이거나, 이전 `snapshot.json`이 있을 때 **이전 행 수의 50%(`MIN_ROW_RATIO = 0.5`) 미만**이면 오류로 즉시 중단합니다.
  - 이 경우 배포 단계(`deploy-pages`)로 넘어가지 않으므로 **직전에 성공한 사이트 배포본이 그대로 유지**됩니다.
  - 만약 장애가 길어져 배포된 내장 공고의 나이가 **`SNAPSHOT_STALE_HOURS`(기본 6시간)를 넘기면**, 방문자 브라우저는 자동으로 기존(v9)처럼 Supabase 서버에서 공고를 읽어옵니다.
- **새 공고가 사이트에 보이기까지 최대 지연 시간**:
  - 자동 빌드는 구글 시트를 **직접** 읽으므로(Supabase 동기화를 거치지 않음) **최대 지연 ≈ 사이트 빌드 주기(1시간) + GitHub Actions 큐 지연(보통 수 분~수십 분)** 입니다.
  - 긴급하게 새 공고를 바로 반영해야 할 때는 Actions 탭에서 **Run workflow**를 수동 실행하면 즉시 반영됩니다.

---

## 5. 되돌리는 방법 (롤백)

내장 공고 기본 사용을 끄고 방문할 때마다 항상 Supabase 서버에서 읽는 기존(v9) 방식으로 즉시 되돌리려면:

1. `site/template.html`에서 `const SNAPSHOT_STALE_HOURS=6;`을 **`const SNAPSHOT_STALE_HOURS=0;`**으로 수정해 배포합니다. (`SNAPSHOT_STALE_HOURS=0`이면 항상 내장본을 오래된 것으로 판단해 서버에서 읽고, 서버 실패 시에만 내장본으로 대체합니다.)
2. 또는 사이트 주소에 임시로 `?live=1` 쿼리를 붙여 서버 읽기 동작을 바로 확인할 수 있습니다.
