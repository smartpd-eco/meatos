# MEATOS Enterprise DB v2.0

## 10만 개 정육점 SaaS 대응 DB 재설계 지침

### 목표

-   정육점 100,000개
-   일 최대 거래 10,000,000건
-   멀티테넌트 SaaS
-   AI/OCR 통합
-   실시간 대시보드
-   장기 확장

## 핵심 원칙

### 1. Multi-Tenant

모든 업무 테이블은 `company_id`, `store_id`, `created_at`를 기본
포함한다.

### 2. 대용량 처리

-   Cursor Pagination
-   Index 최적화
-   Batch 처리
-   Materialized View
-   Read/Write 분리 고려

### 3. AI/OCR 분리

운영 DB와 AI 로그를 논리적으로 분리한다.

운영: - sales - sales_items - purchase - inventory

AI: - ai_logs - ocr_logs - prompt_logs - ai_results

### 4. 월별 Partition

예) - sales_2026_01 - sales_2026_02

### 5. Row Level Security

회사별 데이터 접근을 `company_id` 기준으로 제한한다.

### 6. 통계 전용 집계

-   daily_sales_summary
-   monthly_sales_summary
-   inventory_summary
-   dashboard_summary

## 권장 테이블

-   Company
-   Store
-   User
-   Product
-   Supplier
-   Customer
-   Purchase
-   PurchaseItem
-   Inventory
-   Sales
-   SalesItem
-   Barcode
-   Notification
-   DashboardSummary
-   AI Logs
-   OCR Logs
-   Audit Logs

## 인덱스

-   company_id
-   store_id
-   created_at
-   product_id
-   barcode
-   sales_date

복합 인덱스 - (company_id, created_at) - (company_id, product_id) -
(company_id, barcode)

## 보관 정책

최근 3년은 운영 DB, 이후 Archive DB로 이동한다.

## 로드맵

1.  100개 매장
2.  1,000개
3.  10,000개
4.  100,000개
5.  AI 수요예측 / 전국 유통 빅데이터

## 결론

초기 MVP라도 전국 SaaS를 전제로 DB를 설계한다.
