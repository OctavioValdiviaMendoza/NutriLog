FROM python:3.11-slim

WORKDIR /app

# Use CPU packages for the hosted service.
RUN pip install --no-cache-dir torch torchvision \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Saved weights are mounted here when the container starts.
RUN mkdir -p model

EXPOSE 8001

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
