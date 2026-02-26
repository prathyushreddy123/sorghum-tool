import asyncio
import base64
import json
import logging
import os

from google import genai
from google.genai import types

from config import GEMINI_API_KEY, GROQ_API_KEY, AI_CLASSIFICATION_ENABLED

logger = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-2.5-flash"
MAX_RETRIES = 3
RETRY_BASE_DELAY = 2  # seconds


async def _gemini_generate(client: genai.Client, contents: list) -> str:
    """Call Gemini with retry + exponential backoff for transient 429s."""
    for attempt in range(MAX_RETRIES):
        try:
            response = await client.aio.models.generate_content(
                model=GEMINI_MODEL,
                contents=contents,
            )
            if not response.text:
                raise ValueError(f"Empty response from Gemini (finish_reason: {getattr(response.candidates[0], 'finish_reason', 'unknown') if response.candidates else 'no candidates'})")
            return response.text
        except Exception as e:
            if "429" in str(e) and attempt < MAX_RETRIES - 1:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning(f"Gemini 429, retrying in {delay}s (attempt {attempt + 1}/{MAX_RETRIES})")
                await asyncio.sleep(delay)
            else:
                raise
    raise RuntimeError("Unreachable")

REFERENCE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "reference_images"
)

MAX_REFS_PER_LEVEL = 2

_reference_cache: list[dict] | None = None


def _load_reference_images() -> list[dict]:
    """Load reference images, limited to MAX_REFS_PER_LEVEL per severity level."""
    global _reference_cache
    if _reference_cache is not None:
        return _reference_cache

    import glob

    # Load all reference images grouped by severity
    by_severity: dict[int, list[dict]] = {i: [] for i in range(1, 6)}
    pattern = os.path.join(REFERENCE_DIR, "ergot_severity", "severity_*.*")
    for filepath in sorted(glob.glob(pattern)):
        filename = os.path.basename(filepath)
        ext = os.path.splitext(filename)[1].lower()

        if ext not in (".jpg", ".jpeg", ".png"):
            continue

        try:
            parts = filename.split("_")
            severity = int(parts[1])
            if 1 <= severity <= 5:
                with open(filepath, "rb") as f:
                    mime = "image/png" if ext == ".png" else "image/jpeg"
                    by_severity[severity].append({
                        "severity": severity,
                        "image_bytes": f.read(),
                        "mime_type": mime,
                    })
        except (IndexError, ValueError):
            logger.warning(f"Skipping invalid filename: {filename}")
            continue

    # Select up to MAX_REFS_PER_LEVEL per severity level
    # Prefer smaller files (faster API calls) while maintaining diversity
    # Skip images over 500KB to keep total payload small
    MAX_IMAGE_SIZE = 500 * 1024  # 500KB
    refs = []
    for severity in range(1, 6):
        images = by_severity[severity]
        if not images:
            continue
        # Filter out oversized images, keep all if none are small enough
        small_images = [i for i in images if len(i["image_bytes"]) <= MAX_IMAGE_SIZE]
        candidates = small_images if small_images else images
        # Sort by size ascending, pick first MAX_REFS_PER_LEVEL
        candidates.sort(key=lambda x: len(x["image_bytes"]))
        refs.extend(candidates[:MAX_REFS_PER_LEVEL])

    _reference_cache = refs
    total_available = sum(len(v) for v in by_severity.values())
    logger.info(
        f"Selected {len(refs)} reference images from {total_available} total "
        f"({MAX_REFS_PER_LEVEL}/level) in {REFERENCE_DIR}"
    )
    return refs


SEVERITY_PROMPT = """You are an expert sorghum pathologist specializing in ergot disease (Claviceps africana) severity assessment.

IMPORTANT: First verify the image shows a sorghum panicle. If the image is NOT a sorghum panicle (e.g. rice, corn, wheat, or any non-sorghum plant), respond with:
{"severity": 0, "confidence": 0.0, "reasoning": "Not a sorghum panicle"}

If it IS a sorghum panicle, classify ergot severity using this scale:
1 = None (0% infection) - No visible honeydew or sphacelia on the panicle
2 = Low (1-10%) - Few honeydew droplets on lower florets, minor infection
3 = Moderate (11-25%) - Multiple honeydew droplets spread across panicle
4 = High (26-50%) - Heavy honeydew, visible mold growth beginning
5 = Severe (>50%) - Entire panicle affected, sclerotia forming

I will now show you reference images of sorghum panicles at each severity level, then ask you to classify a new image.

Respond ONLY with valid JSON in this exact format:
{"severity": <0-5>, "confidence": <0.0-1.0>, "reasoning": "<brief one-sentence explanation>"}"""


def _parse_severity_json(text: str) -> dict:
    """Parse severity JSON from LLM response, handling markdown code blocks."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    result = json.loads(text)
    severity = int(result["severity"])
    if severity < 0 or severity > 5:
        raise ValueError(f"Severity {severity} out of range 0-5")

    return {
        "severity": severity,
        "confidence": min(1.0, max(0.0, float(result.get("confidence", 0.0)))),
        "reasoning": str(result.get("reasoning", "")),
    }


async def predict_severity_gemini(image_bytes: bytes, mime_type: str) -> dict | None:
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set, skipping Gemini")
        return None

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        references = _load_reference_images()

        # Build content parts for multimodal request
        contents: list = [SEVERITY_PROMPT]

        for ref in references:
            contents.append(f"\nReference - Severity {ref['severity']}:")
            contents.append(types.Part.from_bytes(
                data=ref["image_bytes"],
                mime_type=ref["mime_type"],
            ))

        contents.append("\nNow classify this new image:")
        contents.append(types.Part.from_bytes(
            data=image_bytes,
            mime_type=mime_type,
        ))
        contents.append("Respond with JSON only.")

        text = await _gemini_generate(client, contents)
        result = _parse_severity_json(text)
        result["provider"] = "gemini"
        return result

    except Exception as e:
        logger.error(f"Gemini prediction failed: {e}")
        return None


async def predict_severity_groq(image_bytes: bytes, mime_type: str) -> dict | None:
    if not GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not set, skipping Groq")
        return None

    try:
        import httpx

        references = _load_reference_images()
        content_parts: list[dict] = [{"type": "text", "text": SEVERITY_PROMPT}]

        for ref in references:
            content_parts.append({"type": "text", "text": f"\nReference - Severity {ref['severity']}:"})
            content_parts.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{ref['mime_type']};base64,{base64.b64encode(ref['image_bytes']).decode()}"
                },
            })

        content_parts.append({"type": "text", "text": "\nNow classify this new image:"})
        content_parts.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode()}"
            },
        })
        content_parts.append({"type": "text", "text": "Respond with JSON only."})

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "meta-llama/llama-4-scout-17b-16e-instruct",
                    "messages": [{"role": "user", "content": content_parts}],
                    "max_tokens": 200,
                    "temperature": 0.1,
                },
                timeout=30.0,
            )
            resp.raise_for_status()
            text = resp.json()["choices"][0]["message"]["content"]

        result = _parse_severity_json(text)
        result["provider"] = "groq"
        return result

    except Exception as e:
        logger.error(f"Groq prediction failed: {e}")
        return None


async def predict_severity(image_bytes: bytes, mime_type: str) -> dict | None:
    """Try Gemini first, fall back to Groq. Returns None if both fail."""
    if not AI_CLASSIFICATION_ENABLED:
        logger.info("AI classification disabled")
        return None

    logger.info(f"Predicting severity: image={len(image_bytes)} bytes, mime={mime_type}, gemini_key={'set' if GEMINI_API_KEY else 'MISSING'}, groq_key={'set' if GROQ_API_KEY else 'MISSING'}")

    result = await predict_severity_gemini(image_bytes, mime_type)
    if result is not None:
        logger.info(f"Gemini result: severity={result.get('severity')}, confidence={result.get('confidence')}")
        return result

    result = await predict_severity_groq(image_bytes, mime_type)
    if result is not None:
        logger.info(f"Groq result: severity={result.get('severity')}, confidence={result.get('confidence')}")
    else:
        logger.error("Both Gemini and Groq failed for severity prediction")
    return result


# ---------------------------------------------------------------------------
# Plant height estimation
# ---------------------------------------------------------------------------

HEIGHT_PROMPT = """You are an expert agronomist estimating sorghum plant height from field photographs.

Your task is to estimate the plant height in centimeters from the image.

INSTRUCTIONS:
1. First, verify the image contains a sorghum plant. If it does not, respond with:
   {"height_cm": 0, "confidence": 0.0, "reasoning": "No sorghum plant visible"}

2. Identify the base of the plant (ground level) and the tip of the panicle (top of the plant).

3. Use any available visual cues to estimate scale:
   - If a measuring stick, pole, or ruler is visible, use its markings (highest accuracy)
   - If a person is visible, use their height as reference (average adult ~170cm)
   - Otherwise, estimate from botanical features: typical sorghum leaf length (30-100cm),
     internode spacing (5-20cm), panicle size (15-40cm), row spacing (~75cm),
     and the relative size of the plant compared to surrounding features

4. Estimate the height from ground level to the top of the panicle.

5. Sorghum plant heights typically range from 50cm to 400cm. If your estimate falls outside
   this range, re-examine the image.

6. Set confidence based on the quality of your reference:
   - 0.8-1.0: Measuring reference (stick, pole) visible
   - 0.6-0.8: Person visible as reference
   - 0.3-0.6: Estimating from botanical features only (no external reference)
   - 0.1-0.3: Very uncertain, poor image quality or ambiguous scale

Respond ONLY with valid JSON in this exact format:
{"height_cm": <integer 50-400 or 0 if cannot estimate>, "confidence": <0.0-1.0>, "reasoning": "<brief one-sentence explanation of how you estimated>"}"""


def _parse_height_json(text: str) -> dict:
    """Parse height JSON from LLM response, handling markdown code blocks."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    result = json.loads(text)
    height_cm = int(result["height_cm"])
    if height_cm != 0 and (height_cm < 50 or height_cm > 400):
        raise ValueError(f"Height {height_cm} out of range 50-400")

    return {
        "height_cm": height_cm,
        "confidence": min(1.0, max(0.0, float(result.get("confidence", 0.0)))),
        "reasoning": str(result.get("reasoning", "")),
    }


async def predict_height_gemini(image_bytes: bytes, mime_type: str) -> dict | None:
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set, skipping Gemini")
        return None

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        contents: list = [
            HEIGHT_PROMPT,
            "\nAnalyze this image:",
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            "Respond with JSON only.",
        ]

        text = await _gemini_generate(client, contents)
        result = _parse_height_json(text)
        result["provider"] = "gemini"
        return result

    except Exception as e:
        logger.error(f"Gemini height prediction failed: {e}")
        return None


async def predict_height_groq(image_bytes: bytes, mime_type: str) -> dict | None:
    if not GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not set, skipping Groq")
        return None

    try:
        import httpx

        content_parts: list[dict] = [
            {"type": "text", "text": HEIGHT_PROMPT},
            {"type": "text", "text": "\nAnalyze this image:"},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode()}"
                },
            },
            {"type": "text", "text": "Respond with JSON only."},
        ]

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "meta-llama/llama-4-scout-17b-16e-instruct",
                    "messages": [{"role": "user", "content": content_parts}],
                    "max_tokens": 200,
                    "temperature": 0.1,
                },
                timeout=30.0,
            )
            resp.raise_for_status()
            text = resp.json()["choices"][0]["message"]["content"]

        result = _parse_height_json(text)
        result["provider"] = "groq"
        return result

    except Exception as e:
        logger.error(f"Groq height prediction failed: {e}")
        return None


async def predict_height(image_bytes: bytes, mime_type: str) -> dict | None:
    """Try Gemini first, fall back to Groq. Returns None if both fail."""
    if not AI_CLASSIFICATION_ENABLED:
        return None

    result = await predict_height_gemini(image_bytes, mime_type)
    if result is not None:
        return result

    return await predict_height_groq(image_bytes, mime_type)
