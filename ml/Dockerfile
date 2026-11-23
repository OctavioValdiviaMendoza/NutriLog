FROM python:3.11-slim

WORKDIR /app

# Install PyTorch CPU-only build (much smaller; swap for CUDA if you have a GPU)
RUN pip install --no-cache-dir torch torchvision \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# model/ directory is volume-mounted at runtime; create it so the image starts
RUN mkdir -p model

EXPOSE 8001

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
