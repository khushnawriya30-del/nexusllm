FROM python:3.11-slim

WORKDIR /app

# System deps kept minimal; aiosqlite/httpx are pure-python wheels.
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Data dir for the SQLite DB (also mounted as a volume in compose).
RUN mkdir -p /app/data

EXPOSE 8080

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
