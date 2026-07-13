Tesseract comparison assets live here.

Expected local layout:

```text
ocr-models/tesseract/lang-data/
  eng.traineddata
  kor.traineddata
```

The OCR comparison engine reads these files locally so failed PaddleOCR cases can be compared without hitting an external language-data CDN.
