import logging
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

if __name__ == "__main__":
    import uvicorn
    from api.app import create_app

    app = create_app()
    uvicorn.run(app, host="0.0.0.0", port=8420)
