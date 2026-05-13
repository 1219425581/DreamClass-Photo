import argparse
import json
import time
import urllib.error
import urllib.request

BASE_URL = "http://127.0.0.1:8000"


def request_json(method: str, path: str, payload: dict | None = None) -> dict:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"{method} {path} -> HTTP {exc.code}: {body}") from exc


def seed_room(count: int, reset: bool) -> dict:
    return request_json("POST", "/api/debug/seed", {"count": count, "reset": reset})


def check_room(expected_count: int) -> dict:
    room = request_json("GET", "/api/room")
    characters = room.get("characters", [])
    if len(characters) != expected_count:
        raise RuntimeError(f"人数校验失败：期望 {expected_count}，实际 {len(characters)}")

    missing_images = [item for item in characters if item.get("status") != "done" or not item.get("imageUrl")]
    if missing_images:
        raise RuntimeError(f"有 {len(missing_images)} 个测试角色缺少完成状态或图片地址")

    return room


def run_cases(max_count: int, step: int, pause: float):
    started = time.time()
    for count in range(0, max_count + 1, step):
        seed_room(count, reset=True)
        room = check_room(count)
        print(f"OK: {count:03d} 位同学，接口返回 {len(room['characters'])} 条角色数据")
        if pause > 0:
            time.sleep(pause)

    elapsed = time.time() - started
    print(f"完成 0-{max_count} 人假数据稳定性测试，用时 {elapsed:.2f}s")


def run_target(count: int):
    started = time.time()
    result = seed_room(count, reset=True)
    room = check_room(count)
    elapsed = time.time() - started
    print(f"已快速注入 {result['count']} 位测试同学")
    print(f"/api/room 校验通过：{len(room['characters'])} 位")
    print(f"请打开 /screen 查看 {count} 人布局效果，用时 {elapsed:.2f}s")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="快速注入假同学数据，测试 0-200 人前后端稳定性，不真实生图")
    parser.add_argument("--target", type=int, default=200, help="直接注入指定人数，默认 200")
    parser.add_argument("--cases", action="store_true", help="按 step 从 0 测到 target")
    parser.add_argument("--step", type=int, default=10, help="cases 模式每次增加人数，默认 10")
    parser.add_argument("--pause", type=float, default=0.2, help="cases 模式每轮暂停秒数，默认 0.2")
    args = parser.parse_args()

    if args.target < 0 or args.target > 500:
        raise SystemExit("target 必须在 0 到 500 之间")
    if args.step <= 0:
        raise SystemExit("step 必须大于 0")

    if args.cases:
        run_cases(args.target, args.step, args.pause)
    else:
        run_target(args.target)
