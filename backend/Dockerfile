FROM python:3.12-slim

WORKDIR /app

# Install system dependencies:
#   - build-essential: gcc for PyMuPDF + soffice AF_UNIX shim compilation
#   - tesseract-ocr: OCR for document processing
#   - libreoffice-impress: PPTX → PDF conversion (thumbnail pipeline)
#   - fonts-noto-cjk: CJK fonts for correct Chinese rendering in LibreOffice
#   - nodejs / pptxgenjs: server-side PptxGenJS execution for thumbnail generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-chi-tra \
    libreoffice-impress \
    libreoffice-base-core \
    fonts-noto-cjk \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g pptxgenjs@4.0.1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
