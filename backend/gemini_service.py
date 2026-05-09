"""
Gemini API サービスモジュール
音声入力されたテキストを読みやすい形に整形する
"""
import os
import time
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Gemini API の設定
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# 使用するモデル（無料枠で1日1,000リクエスト可能）
MODEL_NAME = "gemini-2.5-flash-lite"

# テキスト整形用のシステムプロンプト
SYSTEM_PROMPT = """あなたは、音声入力されたテキストを読みやすく整形する専門家です。
以下のルールに従って、入力されたテキストを整形してください：

1. **句読点の追加**: 適切な位置に「、」「。」を追加する
2. **段落分け**: 話題が変わる箇所で段落を分ける
3. **見出し付け**: 内容に応じて適切な見出し（■ や ● など）を付ける
4. **箇条書き化**: 列挙されている内容は箇条書きに変換する
5. **誤字・脱字の修正**: 音声認識で生じた明らかな誤りを修正する
6. **冗長な表現の整理**: 「えーと」「あのー」などのフィラー語を削除する
7. **文体の統一**: 「です・ます」調に統一する

元の意味や内容を変えないように注意してください。
整形後のテキストのみを出力してください。説明や前置きは不要です。"""


def format_text(raw_text: str, max_retries: int = 3) -> dict:
    """
    音声入力されたテキストを Gemini API で読みやすく整形する

    Args:
        raw_text: 音声入力された生テキスト
        max_retries: リトライ回数（レートリミット時）

    Returns:
        dict: {"success": bool, "formatted_text": str, "error": str|None}
    """
    if not raw_text or not raw_text.strip():
        return {
            "success": False,
            "formatted_text": "",
            "error": "テキストが空です。音声入力してからお試しください。"
        }

    model = genai.GenerativeModel(
        model_name=MODEL_NAME,
        system_instruction=SYSTEM_PROMPT
    )

    for attempt in range(max_retries):
        try:
            response = model.generate_content(raw_text)

            if response.text:
                return {
                    "success": True,
                    "formatted_text": response.text.strip(),
                    "error": None
                }
            else:
                return {
                    "success": False,
                    "formatted_text": "",
                    "error": "テキストの整形に失敗しました。もう一度お試しください。"
                }

        except Exception as e:
            error_msg = str(e)

            # レートリミットエラーの場合はリトライ
            if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
                if attempt < max_retries - 1:
                    # 指数バックオフ（2秒, 4秒, 8秒...）
                    wait_time = 2 ** (attempt + 1)
                    time.sleep(wait_time)
                    continue
                else:
                    return {
                        "success": False,
                        "formatted_text": "",
                        "error": "APIの利用上限に達しました。しばらく待ってから再度お試しください。"
                    }
            else:
                return {
                    "success": False,
                    "formatted_text": "",
                    "error": f"エラーが発生しました: {error_msg}"
                }

    return {
        "success": False,
        "formatted_text": "",
        "error": "予期しないエラーが発生しました。"
    }
