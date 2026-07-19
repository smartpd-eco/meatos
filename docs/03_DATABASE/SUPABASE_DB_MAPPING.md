# MEATOS Supabase DB Mapping

Version: 1.0
Date: 2026-07-11

## 목적

현재 Mock 기반 엔티티를 Supabase PostgreSQL 구조로 옮길 때
필드 충돌과 저장 경계를 명확히 둔다.

## Mock to DB 매핑

| Mock / Store | Supabase Table | 비고 |
|---|---|---|
| `SourceRegistryStore` | `source_registry` | 출처 원장 |
| `ImportQueueStore` | `import_batch`, `product_source_row`, `import_queue` | 원본행 분리 저장 |
| `LearningTableStore` | `learning_history` | 누적형 이력 |
| `AliasMemoryStore` | `supplier_alias` | 공급사 전용 Alias |
| `ProductEngine aliases` | `product_alias` | 공용 Alias |
| `ProductEngine products` | `product_master` | 운영 SKU |
| `product-attribute-standard` | `product_attribute_value` | 기준정보 |
| `ocr-provider-registry` | `ocr_provider_registry` | Provider 목록 |
| `ocr-document-queue-store` | `ocr_document`, `ocr_line_item`, `ocr_processing_history` | 원본/정제/이력 분리 |
| `review queue` | `review_queue` | 승인 흐름 |
| `eventEngine` | `audit_event` | 변경 이력 |

## 충돌 목록

1. Mock의 `sourceId`는 DB에서 `source_registry.id`가 아니라 `source_code`와 `id`를 분리한다.
2. Mock의 `supplierId`는 DB에서 `supplier_master.id`를 사용한다.
3. Mock의 `productId`는 DB에서 `product_master.id`를 사용한다.
4. Mock의 OCR 원본 JSON과 정제 JSON은 DB에서 분리 저장한다.
5. Mock의 Alias Memory는 공용 Alias와 Supplier Alias로 분리한다.
6. 자동 생성 후보는 `product_dictionary.review_status = PENDING`으로 유지한다.

## 실행 원칙

- 원본 payload는 덮어쓰지 않는다.
- Dictionary 승인 전 Product Master를 만들지 않는다.
- Review 없이 운영 재고를 변경하지 않는다.
- Auth / RLS / Production 배포는 이번 Sprint에서 변경하지 않는다.

