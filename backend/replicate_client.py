import base64
import json
import os
import time
import urllib.error
import urllib.request

from image_config import load_image_config

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(STATIC_DIR, exist_ok=True)

PROMPT_KEYWORDS = {
    "男": "male, man, masculine face",
    "男人": "male, man, masculine face",
    "男性": "male, man, masculine face",
    "男生": "young man, handsome student, clean face",
    "少年": "young man, bright youthful face",
    "女": "female, woman, feminine face",
    "女人": "female, woman, feminine face",
    "女性": "female, woman, feminine face",
    "女孩": "girl, young woman",
    "少女": "young woman, girl",
    "女生": "young woman, pretty student, bright smile",
    "小孩": "child, kid",
    "儿童": "child, kid",
    "金发": "blonde hair, golden hair, clearly blonde hairstyle",
    "银发": "silver hair, white hair, clearly silver hairstyle",
    "白发": "white hair, clearly white hairstyle",
    "黑发": "black hair, clearly black hairstyle",
    "红发": "red hair, clearly red hairstyle",
    "蓝发": "blue hair, clearly blue hairstyle",
    "粉发": "pink hair, clearly pink hairstyle",
    "绿发": "green hair, clearly green hairstyle",
    "紫发": "purple hair, clearly purple hairstyle",
    "长发": "long hair",
    "短发": "short hair",
    "卷发": "curly hair",
    "寸头": "buzz cut, very short hair",
    "光头": "bald head",
    "胡子": "beard, facial hair",
    "络腮胡": "full beard, thick beard",
    "八字胡": "mustache",
    "眼镜": "wearing glasses, visible eyeglasses",
    "墨镜": "wearing sunglasses",
    "胖": "overweight, chubby, round face",
    "瘦": "thin, slim, narrow face",
    "肌肉": "muscular body, strong build, broad shoulders",
    "高大": "tall, large build",
    "魔法师": "wizard, mage, fantasy sorcerer, holding a magic staff",
    "法师": "wizard, mage, fantasy sorcerer, holding a magic staff",
    "骑士": "knight, fantasy warrior",
    "战士": "warrior, fighter",
    "公主": "princess, royal dress",
    "王子": "prince, royal outfit",
    "披风": "wearing a cloak, flowing cape, visible cape",
    "斗篷": "wearing a cloak, hooded cape, visible cloak",
    "盔甲": "wearing armor, metal armor",
    "西装": "wearing a suit, formal suit",
    "校服": "wearing school uniform",
    "汉服": "wearing hanfu, traditional Chinese clothing",
    "旗袍": "wearing qipao, cheongsam",
    "红色": "red color, red clothing",
    "蓝色": "blue color, blue clothing",
    "绿色": "green color, green clothing",
    "黑色": "black color, black clothing",
    "白色": "white color, white clothing",
    "紫色": "purple color, purple clothing",
    "黄色": "yellow color, yellow clothing",
    "金色": "gold color, golden details",
    "可爱": "cute, adorable",
    "帅": "handsome",
    "漂亮": "beautiful, attractive face",
    "阳光": "sunny, cheerful, bright expression",
    "自信": "confident expression",
    "温柔": "gentle expression, soft smile",
    "清爽": "clean and fresh appearance",
    "严肃": "serious expression",
    "微笑": "smiling",
    "开心": "happy expression",
    "赛博朋克": "cyberpunk style, neon lights, futuristic city",
    "古风": "traditional Chinese fantasy style, hanfu, ancient China aesthetic",
    "二次元": "anime style, illustration",
    "卡通": "cartoon style",
    "写实": "photorealistic, realistic photo",
    "像素": "pixel art style",
    "蒸汽朋克": "steampunk style, brass gears, goggles",
}


def _matched_tags(user_prompt: str) -> list[str]:
    prompt = user_prompt.strip()
    tags = [english for chinese, english in PROMPT_KEYWORDS.items() if chinese in prompt]
    return list(dict.fromkeys(tags))


def _build_prompt(user_prompt: str) -> str:
    prompt = user_prompt.strip()
    tags = _matched_tags(prompt)
    tag_text = ", ".join(tags)
    subject = tag_text or prompt

    return (
        f"A high-quality character portrait matching this request: {prompt}. "
        f"Key visual traits: {subject}. "
        "Single character, waist-up portrait, full head and shoulders visible, medium shot, "
        "visible hairstyle, visible clothing, visible accessories, clear silhouette, "
        "accurate hair color, accurate clothing color, accurate age, accurate gender, accurate occupation, "
        "friendly positive appearance, mainstream aesthetic, expressive face, detailed eyes, "
        "cinematic studio lighting, high detail, sharp focus. "
        "No text, no logo, no watermark, no cropped head, no extreme close-up."
    )


def _post_json(config: dict, payload: dict) -> dict:
    if not config["api_key"]:
        raise RuntimeError("请在 backend/image_api_config.json 中填写当前 provider 的 api_key")

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        config["api_url"],
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {config['api_key']}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=config["timeout"]) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _download_image(url: str, timeout: int) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "DreamClassPhoto/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _extract_image_bytes(response: dict, timeout: int) -> bytes:
    data = response.get("data")
    if isinstance(data, list) and data:
        item = data[0]
        if item.get("b64_json"):
            return base64.b64decode(item["b64_json"])
        if item.get("url"):
            return _download_image(item["url"], timeout)

    images = response.get("images")
    if isinstance(images, list) and images:
        item = images[0]
        if isinstance(item, str):
            if item.startswith("http"):
                return _download_image(item, timeout)
            return base64.b64decode(item)
        if isinstance(item, dict):
            if item.get("url"):
                return _download_image(item["url"], timeout)
            if item.get("b64_json") or item.get("base64"):
                return base64.b64decode(item.get("b64_json") or item.get("base64"))

    raise RuntimeError(f"No image found in API response: {response}")


def generate_image(prompt: str) -> str | None:
    config = load_image_config()
    full_prompt = _build_prompt(prompt)
    print(f"[{config['provider']} Image API] POST {config['api_url']} model={config['model']}")
    print(f"[Image Prompt] {full_prompt}")

    payload = {
        "model": config["model"],
        "prompt": full_prompt,
        "n": 1,
        "size": config["size"],
    }

    last_error = None
    for attempt in range(config["retries"] + 1):
        try:
            response = _post_json(config, payload)
            image_bytes = _extract_image_bytes(response, config["timeout"])

            filename = f"char_{int(time.time() * 1000)}.png"
            filepath = os.path.join(STATIC_DIR, filename)
            with open(filepath, "wb") as f:
                f.write(image_bytes)

            return f"/static/{filename}"
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="ignore")
            last_error = f"HTTP {e.code}: {body}"
        except Exception as e:
            last_error = f"{type(e).__name__}: {e}"

        if attempt < config["retries"]:
            print(f"[Image API Retry] {attempt + 1}/{config['retries']}: {last_error}")
            time.sleep(1.5 * (attempt + 1))

    print(f"[Image Generate Error] {last_error}")
    return None
