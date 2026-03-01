FROM pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime

WORKDIR /app

# Install Python dependencies
RUN pip install --no-cache-dir \
    runpod>=1.6.0 \
    supabase>=2.0.0 \
    onnx>=1.14 \
    onnxruntime>=1.16 \
    Pillow>=10.0 \
    scikit-learn>=1.3 \
    httpx>=0.24.0 \
    numpy>=1.24

# Copy training code
COPY train_logic.py /app/train_logic.py
COPY handler.py /app/handler.py

CMD ["python", "/app/handler.py"]
