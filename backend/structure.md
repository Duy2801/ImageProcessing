# Kien truc backend xu ly anh bang AWS Serverless

## 1. Muc tieu he thong

He thong cho phep nguoi dung upload anh tu frontend, sau do backend xu ly anh theo pipeline bat dong bo tren AWS.

Cac chuc nang chinh:

- Tao signed URL de frontend upload anh len Amazon S3.
- Kiem tra anh dau vao: dinh dang, kich thuoc, metadata.
- Resize anh.
- Ap dung filter anh.
- Them watermark.
- Nen anh va luu ket qua cuoi cung.
- Luu trang thai xu ly de frontend theo doi tien do.
- Tra signed URL de frontend xem hoac tai anh da xu ly.

Pham vi hien tai: **chi xu ly anh**. Chua lam xu ly video.

---

## 2. Luong xu ly tong quan

```text
Frontend
   |
   v
POST /upload-url
   |
   v
S3 signed upload URL
   |
   v
Frontend PUT anh len S3
   |
   v
POST /process
   |
   v
Lambda 1
(Kiem tra anh)
   |
   v
SQS resize queue
   |
   v
Lambda 2
(Resize anh)
   |
   v
SQS filter queue
   |
   v
Lambda 3
(Filter anh)
   |
   v
SQS watermark queue
   |
   v
Lambda 4
(Watermark anh)
   |
   v
SQS compress queue
   |
   v
Lambda 5
(Compress anh)
   |
   v
S3 processed/{jobId}/final.webp
   |
   v
GET /status/{jobId}
```

Frontend goi `GET /status/{jobId}` de xem tien do. Khi job hoan thanh, API tra ve `resultUrl` la signed URL cua anh ket qua.

---

## 3. Cong nghe su dung

| Thanh phan | Cong nghe | Vai tro |
| --- | --- | --- |
| Backend runtime | Node.js 20 | Chay Lambda |
| Deploy framework | Serverless Framework v3 | Khai bao Lambda, API Gateway, S3, SQS |
| API | API Gateway | Expose `/upload-url`, `/process`, `/status/{jobId}` |
| Storage | Amazon S3 | Luu anh goc, anh trung gian va anh ket qua |
| Queue | Amazon SQS | Noi cac buoc xu ly anh bat dong bo |
| Image processing | Sharp | Validate, resize, filter, watermark, compress |
| AWS SDK | AWS SDK v3 | Lam viec voi S3, SQS va signed URL |

---

## 4. API backend

### 4.1. Tao signed upload URL

```text
POST /upload-url
```

Request:

```json
{
  "contentType": "image/jpeg"
}
```

Response:

```json
{
  "message": "Upload URL created",
  "data": {
    "jobId": "uuid",
    "bucket": "image-pipeline-bucket-dev-local",
    "sourceKey": "originals/uuid/original.jpg",
    "uploadUrl": "https://...",
    "expiresIn": 900
  }
}
```

Sau do frontend upload file truc tiep len `uploadUrl` bang method `PUT`.

### 4.2. Bat dau xu ly anh

```text
POST /process
```

Request khi anh da co tren S3:

```json
{
  "jobId": "uuid",
  "sourceKey": "originals/uuid/original.jpg",
  "options": {
    "resize": {
      "width": 1280,
      "fit": "inside"
    },
    "filter": "grayscale",
    "watermark": {
      "text": "Demo",
      "opacity": 0.35
    },
    "compress": {
      "format": "webp",
      "quality": 82
    }
  }
}
```

Response:

```json
{
  "message": "Image processing job started",
  "data": {
    "jobId": "uuid",
    "status": "VALIDATED",
    "nextStage": "RESIZE",
    "statusKey": "processed/uuid/status.json",
    "sourceKey": "originals/uuid/original.jpg"
  }
}
```

### 4.3. Xem trang thai xu ly

```text
GET /status/{jobId}
```

Response khi dang xu ly:

```json
{
  "message": "Job status loaded",
  "data": {
    "jobId": "uuid",
    "stage": "FILTERED",
    "progress": 60,
    "sourceKey": "originals/uuid/original.jpg",
    "currentKey": "processed/uuid/03-filtered.png",
    "finalKey": null,
    "resultUrl": null
  }
}
```

Response khi hoan thanh:

```json
{
  "message": "Job status loaded",
  "data": {
    "jobId": "uuid",
    "stage": "COMPLETED",
    "progress": 100,
    "finalKey": "processed/uuid/final.webp",
    "resultUrl": "https://..."
  }
}
```

---

## 5. Cac Lambda chinh

### 5.1. Lambda 1 - validate image

File:

```text
backend/pipeline-image-video/functions/00-start/index.js
```

Nhiem vu:

- Nhan request tu API Gateway.
- Doc anh goc tu S3 hoac nhan base64 neu can.
- Dung `sharp().metadata()` de kiem tra anh.
- Luu file da validate vao `processed/{jobId}/01-validated.ext`.
- Ghi status `VALIDATED`.
- Gui message sang resize queue.

### 5.2. Lambda 2 - resize

File:

```text
backend/pipeline-image-video/functions/01-resize/index.js
```

Nhiem vu:

- Doc message tu resize queue.
- Lay anh tu S3.
- Resize anh theo option.
- Luu file `processed/{jobId}/02-resized.png`.
- Ghi status `RESIZED`.
- Gui message sang filter queue.

### 5.3. Lambda 3 - filter

File:

```text
backend/pipeline-image-video/functions/02-filter/index.js
```

Nhiem vu:

- Ap dung filter anh.
- Cac filter ho tro: `none`, `grayscale`, `sepia`, `blur`, `bright`.
- Luu file `processed/{jobId}/03-filtered.png`.
- Ghi status `FILTERED`.
- Gui message sang watermark queue.

### 5.4. Lambda 4 - watermark

File:

```text
backend/pipeline-image-video/functions/03-watermark/index.js
```

Nhiem vu:

- Tao watermark SVG bang text.
- Composite watermark len anh bang Sharp.
- Luu file `processed/{jobId}/04-watermarked.png`.
- Ghi status `WATERMARKED`.
- Gui message sang compress queue.

### 5.5. Lambda 5 - compress

File:

```text
backend/pipeline-image-video/functions/04-compress/index.js
```

Nhiem vu:

- Nen anh theo format va quality.
- Format ho tro: `webp`, `jpeg`, `jpg`, `png`, `avif`.
- Luu file cuoi cung vao `processed/{jobId}/final.{format}`.
- Ghi status `COMPLETED`.

---

## 6. Cau truc thu muc hien tai

```text
backend/pipeline-image-video/
  common/
    http.js
    job.js
    s3.js
    sqs.js

  functions/
    00-start/
      index.js
    01-resize/
      index.js
    02-filter/
      index.js
    03-watermark/
      index.js
    04-compress/
      index.js
    05-status/
      index.js
    06-upload-url/
      index.js

  package.json
  package-lock.json
  README.md
  serverless.yml
```

Ghi chu: ten thu muc `pipeline-image-video` dang duoc giu lai theo cau truc ban dau cua project, nhung noi dung hien tai chi xu ly anh.

---

## 7. Cau truc S3

```text
originals/{jobId}/original.jpg

processed/{jobId}/01-validated.jpg
processed/{jobId}/02-resized.png
processed/{jobId}/03-filtered.png
processed/{jobId}/04-watermarked.png
processed/{jobId}/final.webp
processed/{jobId}/status.json
```

---

## 8. Trang thai xu ly

| Status | Progress | Y nghia |
| --- | --- | --- |
| `VALIDATED` | 20 | Anh hop le va da dua vao pipeline |
| `RESIZED` | 40 | Anh da resize |
| `FILTERED` | 60 | Anh da ap dung filter |
| `WATERMARKED` | 80 | Anh da them watermark |
| `COMPLETED` | 100 | Anh da nen va luu ket qua cuoi |

---

## 9. Chay va deploy

Cai dependencies:

```bash
cd backend/pipeline-image-video
npm install
```

Kiem tra package Serverless:

```bash
npx serverless package
```

Deploy len AWS:

```bash
AWS_ACCOUNT_ID=123456789012 npm run deploy
```

Neu dung PowerShell:

```powershell
$env:AWS_ACCOUNT_ID="123456789012"
npm run deploy
```

---

## 10. Ket luan

Backend hien tai tap trung vao xu ly anh bang AWS Serverless:

- API Gateway nhan request tu frontend.
- S3 luu anh goc, anh trung gian va anh ket qua.
- Lambda xu ly tung buoc rieng.
- SQS tach cac buoc de retry va scale doc lap.
- Sharp thuc hien cac thao tac xu ly anh.

Phan xu ly video chua nam trong pham vi hien tai va co the bo sung sau bang pipeline rieng.
