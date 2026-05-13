import argparse
import base64
import json
import os
import time
import urllib.error
import urllib.request

from image_config import get_active_provider, load_image_config

DEFAULT_PROVIDER = get_active_provider()


def post_json(url: str, api_key: str, payload: dict, timeout: int) -> dict:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download_image(url: str, timeout: int) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "DreamClassPhoto-SupAI-Tool/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def extract_image_bytes(response: dict, timeout: int) -> bytes:
    data = response.get("data")
    if isinstance(data, list) and data:
        item = data[0]
        if isinstance(item, dict):
            if item.get("b64_json"):
                return base64.b64decode(item["b64_json"])
            if item.get("url"):
                return download_image(item["url"], timeout)

    images = response.get("images")
    if isinstance(images, list) and images:
        item = images[0]
        if isinstance(item, str):
            if item.startswith("http"):
                return download_image(item, timeout)
            return base64.b64decode(item)
        if isinstance(item, dict):
            if item.get("url"):
                return download_image(item["url"], timeout)
            if item.get("b64_json") or item.get("base64"):
                return base64.b64decode(item.get("b64_json") or item.get("base64"))

    raise RuntimeError(f"接口返回中没有找到图片数据：{json.dumps(response, ensure_ascii=False)[:1000]}")


def generate_image(prompt: str, api_key: str, api_url: str, model: str, size: str, output: str, timeout: int):
    payload = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "size": size,
    }

    print(f"POST {api_url}")
    print(f"model={model}")
    print(f"prompt={prompt}")

    response = post_json(api_url, api_key, payload, timeout)
    image_bytes = extract_image_bytes(response, timeout)

    os.makedirs(os.path.dirname(os.path.abspath(output)) or ".", exist_ok=True)
    with open(output, "wb") as f:
        f.write(image_bytes)

    print(f"已保存：{output}")


def main():
    parser = argparse.ArgumentParser(description="独立图片 API 生图工具")
    parser.add_argument("prompt", nargs="?", help="生图提示词")
    parser.add_argument("--prompt", dest="prompt_option", help="生图提示词，适合包含复杂引号的情况")
    parser.add_argument("--provider", default=DEFAULT_PROVIDER, choices=["supai", "siliconflow"], help="生图服务，默认读取 backend/image_api_config.json")
    parser.add_argument("--output", "-o", default="", help="输出图片路径，默认保存到 backend/static/provider_xxx.png")
    args, _ = parser.parse_known_args()

    config = load_image_config(args.provider)
    parser.add_argument("--model", default=config["model"], help="模型名，默认读取 provider 配置")
    parser.add_argument("--size", default=config["size"], help="图片尺寸，默认读取 provider 配置")
    parser.add_argument("--url", default=config["api_url"], help="图片接口地址，默认读取 provider 配置")
    parser.add_argument("--timeout", type=int, default=config["timeout"], help="请求超时时间秒数，默认读取 provider 配置")
    args = parser.parse_args()

    prompt = args.prompt_option or args.prompt
    if not prompt:
        raise SystemExit("请提供提示词，例如：python supai_image_tool.py \"阳光少年，白色衬衫，清新写实\"")

    api_key = config["api_key"]
    if not api_key:
        raise SystemExit(f"请在 backend/image_api_config.json 中填写 {args.provider} 的 api_key")

    output = args.output
    if not output:
        static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
        output = os.path.join(static_dir, f"{args.provider}_{int(time.time() * 1000)}.png")

    try:
        generate_image(prompt, api_key, args.url, args.model, args.size, output, args.timeout)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise SystemExit(f"HTTP {e.code}: {body}")
    except Exception as e:
        raise SystemExit(f"生图失败：{type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
