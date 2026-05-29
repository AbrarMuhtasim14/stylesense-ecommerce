FROM python:3.11-slim

# Set environment variables for cache directories that UID 1000 can access
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    HF_HOME=/home/user/.cache \
    TORCH_HOME=/home/user/.cache

# Create user and cache directories with appropriate ownership
RUN useradd -m -u 1000 user && \
    mkdir -p /home/user/.cache && \
    chown -R user:user /home/user

WORKDIR /home/user/app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU-only first (smaller image size)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download CLIP model weights at build time into user cache (avoids runtime/cold-start downloads)
RUN chown -R user:user /home/user && \
    USER=user python -c "import open_clip; open_clip.create_model_and_transforms('ViT-B-32', pretrained='openai')"

# Copy application code
COPY --chown=user:user . .

USER user

# Expose HuggingFace Spaces port
EXPOSE 7860

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
