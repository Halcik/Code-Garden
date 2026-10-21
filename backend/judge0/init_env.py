"""Create local Judge0 config with distinct random passwords; preserve existing config."""
from pathlib import Path
import secrets


def main():
    target = Path(__file__).with_name(".env")
    if target.exists():
        print("Preserving existing backend/judge0/.env")
        return
    config = target.with_name(".env.example").read_text(encoding="utf-8")
    for key in ("POSTGRES_PASSWORD", "REDIS_PASSWORD"):
        config = config.replace(f"{key}=\n", f"{key}={secrets.token_hex(32)}\n")
    # 'x' refuses to overwrite an env created concurrently.
    with target.open("x", encoding="utf-8", newline="\n") as output:
        output.write(config)
    print("Created ignored backend/judge0/.env; passwords were not printed")


if __name__ == "__main__":
    main()
