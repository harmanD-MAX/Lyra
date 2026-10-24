import os
import logging
from typing import Optional
import boto3
from botocore.config import Config

logger = logging.getLogger("lyra_r2")

R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "21bb43135d8c5a440c019505b8046f43")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "6b0f6d0856a02f517f0f0ded8bfd9d82")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "187abc7d1282c047a5ce8011c4f32f1e8b4f2a4d5b348d82eab3ee62bfca7f8e")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "lyra-music-storage")
R2_CUSTOM_DOMAIN = os.environ.get("R2_CUSTOM_DOMAIN", "https://pub-168b6b7267cf42d0bebbf2ce062dbf9d.r2.dev")


def is_r2_configured() -> bool:
    return bool(R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME)


def get_r2_client():
    if not is_r2_configured():
        return None
    endpoint_url = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    return boto3.client(
        service_name="s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"}
        )
    )


def upload_audio_to_r2(local_file_path: str, remote_key: str, content_type: Optional[str] = None) -> Optional[str]:
    """
    Uploads an audio file to Cloudflare R2 with aggressive browser caching headers
    (Cache-Control: public, max-age=31536000, immutable) to eliminate R2 Class B requests.
    Returns the public/streaming URL or S3 key.
    """
    if not is_r2_configured():
        logger.info("R2 storage not configured; keeping audio local.")
        return None

    if not os.path.exists(local_file_path) or os.path.getsize(local_file_path) == 0:
        logger.warning(f"File {local_file_path} is missing or empty, skipping R2 upload.")
        return None

    client = get_r2_client()
    if not client:
        return None

    if not content_type:
        if local_file_path.endswith(".opus") or local_file_path.endswith(".ogg"):
            content_type = "audio/ogg; codecs=opus"
        elif local_file_path.endswith(".mp3"):
            content_type = "audio/mpeg"
        elif local_file_path.endswith(".wav"):
            content_type = "audio/wav"
        else:
            content_type = "application/octet-stream"

    try:
        # Immutable caching header protects Class B operations
        extra_args = {
            "ContentType": content_type,
            "CacheControl": "public, max-age=31536000, immutable"
        }
        with open(local_file_path, "rb") as f:
            client.upload_fileobj(
                f,
                R2_BUCKET_NAME,
                remote_key,
                ExtraArgs=extra_args
            )
        logger.info(f"Uploaded {local_file_path} to R2 bucket '{R2_BUCKET_NAME}' key '{remote_key}' successfully.")

        if R2_CUSTOM_DOMAIN:
            base = R2_CUSTOM_DOMAIN.rstrip("/")
            return f"{base}/{remote_key}"
        return remote_key
    except Exception as e:
        logger.error(f"Failed to upload to Cloudflare R2: {e}", exc_info=True)
        return None


def get_r2_presigned_url(remote_key: str, expires_in: int = 86400) -> Optional[str]:
    """
    Generates a presigned streaming GET URL for Cloudflare R2 object.
    Valid for 24 hours (86,400s) by default.
    """
    if not is_r2_configured():
        return None

    if R2_CUSTOM_DOMAIN:
        return f"{R2_CUSTOM_DOMAIN.rstrip('/')}/{remote_key}"

    client = get_r2_client()
    if not client:
        return None

    try:
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": R2_BUCKET_NAME, "Key": remote_key},
            ExpiresIn=expires_in
        )
        return url
    except Exception as e:
        logger.error(f"Error generating presigned URL for {remote_key}: {e}")
        return None


def get_cloud_catalog() -> dict:
    """Fetches the global cloud_catalog.json from Cloudflare R2 bucket."""
    if not is_r2_configured():
        return {}
    client = get_r2_client()
    if not client:
        return {}
    try:
        import json
        resp = client.get_object(Bucket=R2_BUCKET_NAME, Key="cloud_catalog.json")
        content = resp["Body"].read().decode("utf-8")
        return json.loads(content)
    except Exception:
        return {}


def save_cloud_catalog(catalog: dict) -> bool:
    """Saves the global cloud_catalog.json to Cloudflare R2 bucket."""
    if not is_r2_configured():
        return False
    client = get_r2_client()
    if not client:
        return False
    try:
        import json
        data = json.dumps(catalog, indent=2).encode("utf-8")
        client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key="cloud_catalog.json",
            Body=data,
            ContentType="application/json"
        )
        return True
    except Exception as e:
        logger.error(f"Failed to save cloud catalog to R2: {e}")
        return False
