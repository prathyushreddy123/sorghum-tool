import os
from abc import ABC, abstractmethod

from config import settings


class StorageBackend(ABC):
    @abstractmethod
    def save(self, filename: str, data: bytes) -> None:
        ...

    @abstractmethod
    def get_url(self, filename: str) -> str:
        ...

    @abstractmethod
    def get_bytes(self, filename: str) -> bytes:
        ...

    @abstractmethod
    def delete(self, filename: str) -> None:
        ...

    @abstractmethod
    def exists(self, filename: str) -> bool:
        ...


class LocalStorage(StorageBackend):
    def __init__(self, upload_dir: str):
        self.upload_dir = upload_dir
        os.makedirs(self.upload_dir, exist_ok=True)

    def _path(self, filename: str) -> str:
        return os.path.join(self.upload_dir, filename)

    def save(self, filename: str, data: bytes) -> None:
        with open(self._path(filename), "wb") as f:
            f.write(data)

    def get_url(self, filename: str) -> str:
        # For local storage, return the API endpoint path
        return f"/images/{filename}"

    def get_bytes(self, filename: str) -> bytes:
        with open(self._path(filename), "rb") as f:
            return f.read()

    def delete(self, filename: str) -> None:
        path = self._path(filename)
        if os.path.exists(path):
            os.remove(path)

    def exists(self, filename: str) -> bool:
        return os.path.exists(self._path(filename))


class GCSStorage(StorageBackend):
    def __init__(self, bucket_name: str):
        from google.cloud import storage as gcs
        self.client = gcs.Client()
        self.bucket = self.client.bucket(bucket_name)

    def save(self, filename: str, data: bytes) -> None:
        blob = self.bucket.blob(f"images/{filename}")
        blob.upload_from_string(data)

    def get_url(self, filename: str) -> str:
        blob = self.bucket.blob(f"images/{filename}")
        # Generate signed URL valid for 1 hour
        return blob.generate_signed_url(expiration=3600, method="GET")

    def get_bytes(self, filename: str) -> bytes:
        blob = self.bucket.blob(f"images/{filename}")
        return blob.download_as_bytes()

    def delete(self, filename: str) -> None:
        blob = self.bucket.blob(f"images/{filename}")
        if blob.exists():
            blob.delete()

    def exists(self, filename: str) -> bool:
        blob = self.bucket.blob(f"images/{filename}")
        return blob.exists()


_storage: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _storage
    if _storage is None:
        if settings.GCS_BUCKET:
            _storage = GCSStorage(settings.GCS_BUCKET)
        else:
            upload_dir = settings.UPLOAD_DIR or os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads"
            )
            _storage = LocalStorage(upload_dir)
    return _storage
