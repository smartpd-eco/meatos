# PaddleOCR local model assets

Place the PaddleOCR model tar files here so the browser SDK can load them from the local server instead of the remote Paddle model host.

Expected files:

- `PP-OCRv5_mobile_det_onnx_infer.tar`
- `PP-OCRv5_mobile_rec_onnx_infer.tar`

Default base URL used by the app:

`/ocr-models/paddle`

Notes:

- The tar files must be uncompressed `.tar` archives.
- The browser app will look for these files before falling back to the CLOVA provider.
- Keep the file names exact so the SDK can resolve them without extra config.
