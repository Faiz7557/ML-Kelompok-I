FROM python:3.9-slim

# Install system dependencies for OpenCV and other packages
RUN apt-get update && apt-get install -y \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all project files into the container
COPY . .

# Set working directory to backend folder so main.py runs in correct context
WORKDIR /app/backend

# Expose the default Hugging Face Spaces port (7860)
EXPOSE 7860

# Run Uvicorn server pointing to main.py
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
