"""
音声記録アプリ - Flask バックエンド
音声入力テキストを整形してGoogle Docsに保存するAPI
"""
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from gemini_service import format_text
from google_docs_service import save_to_google_docs

# 環境変数の読み込み
load_dotenv()

app = Flask(__name__)

# CORS 設定（フロントエンドからのアクセスを許可）
frontend_url = os.getenv("FRONTEND_URL", "*")
CORS(app, resources={
    r"/api/*": {
        "origins": frontend_url if frontend_url != "*" else "*",
        "methods": ["POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})


@app.route("/health", methods=["GET"])
def health_check():
    """ヘルスチェックエンドポイント"""
    return jsonify({"status": "ok", "message": "音声記録アプリ API は正常に稼働中です"})


@app.route("/api/process", methods=["POST"])
def process_text():
    """
    テキストを受け取り、Geminiで整形してGoogle Docsに保存する

    Request Body:
        {
            "text": "音声入力されたテキスト",
            "title": "ドキュメントタイトル（オプション）"
        }

    Response:
        {
            "success": true,
            "doc_url": "https://docs.google.com/...",
            "doc_id": "...",
            "title": "音声メモ - 2026年05月02日 10:30",
            "formatted_text": "整形済みテキスト"
        }
    """
    # リクエストデータの取得
    data = request.get_json()

    if not data:
        return jsonify({
            "success": False,
            "error": "リクエストボディが空です。"
        }), 400

    raw_text = data.get("text", "").strip()
    title = (data.get("title") or "").strip() or None
    access_token = data.get("access_token")

    if not access_token:
        return jsonify({
            "success": False,
            "error": "Googleアカウントでログインしてください（認証エラー）。"
        }), 401

    if not raw_text:
        return jsonify({
            "success": False,
            "error": "テキストが入力されていません。"
        }), 400

    # 1. Gemini API でテキストを整形
    format_result = format_text(raw_text)

    if not format_result["success"]:
        return jsonify({
            "success": False,
            "error": format_result["error"]
        }), 500

    formatted_text = format_result["formatted_text"]

    # 2. Google Docs に保存（ユーザーのアクセストークンを使用）
    save_result = save_to_google_docs(formatted_text, access_token, title)

    if not save_result["success"]:
        return jsonify({
            "success": False,
            "error": save_result["error"],
            "formatted_text": formatted_text  # 整形済みテキストは返す
        }), 500

    # 3. 成功レスポンス
    return jsonify({
        "success": True,
        "doc_url": save_result["doc_url"],
        "doc_id": save_result["doc_id"],
        "title": save_result["title"],
        "formatted_text": formatted_text
    }), 200


@app.errorhandler(404)
def not_found(error):
    return jsonify({"success": False, "error": "エンドポイントが見つかりません。"}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({"success": False, "error": "サーバー内部エラーが発生しました。"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.getenv("FLASK_ENV", "production") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
