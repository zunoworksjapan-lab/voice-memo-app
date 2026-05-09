"""
Google Docs API サービスモジュール
整形済みテキストを Google ドキュメントに保存する
"""
import os
import json
from datetime import datetime
from google.oauth2 import service_account
from googleapiclient.discovery import build
from dotenv import load_dotenv

load_dotenv()

# Google API のスコープ
SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file"
]


from google.oauth2.credentials import Credentials

def _get_docs_service(access_token: str):
    """Google Docs API サービスを取得する"""
    credentials = Credentials(token=access_token)
    return build("docs", "v1", credentials=credentials)


def _get_drive_service(access_token: str):
    """Google Drive API サービスを取得する"""
    credentials = Credentials(token=access_token)
    return build("drive", "v3", credentials=credentials)


def save_to_google_docs(formatted_text: str, access_token: str, title: str = None) -> dict:
    """
    整形済みテキストを Google ドキュメントに保存する

    Args:
        formatted_text: 整形済みテキスト
        access_token: フロントエンドから渡されたユーザーのOAuthアクセストークン
        title: ドキュメントのタイトル（省略時は日時で自動生成）

    Returns:
        dict: {"success": bool, "doc_url": str, "doc_id": str, "error": str|None}
    """
    if not formatted_text or not formatted_text.strip():
        return {
            "success": False,
            "doc_url": "",
            "doc_id": "",
            "error": "保存するテキストが空です。"
        }

    # タイトルが未指定の場合は日時で自動生成
    if not title:
        now = datetime.now().strftime("%Y年%m月%d日 %H:%M")
        title = f"音声メモ - {now}"

    try:
        docs_service = _get_docs_service(access_token)
        drive_service = _get_drive_service(access_token)

        # 1. 新しいドキュメントを作成（Drive APIを使用し、各ユーザーのルートディレクトリに作成）
        file_metadata = {
            'name': title,
            'mimeType': 'application/vnd.google-apps.document'
        }

        document = drive_service.files().create(
            body=file_metadata,
            fields='id'
        ).execute()

        doc_id = document.get("id")

        # 2. テキストを挿入
        requests = [
            {
                "insertText": {
                    "location": {"index": 1},
                    "text": formatted_text
                }
            }
        ]

        docs_service.documents().batchUpdate(
            documentId=doc_id,
            body={"requests": requests}
        ).execute()

        # 3. 指定フォルダへの移動は作成時に実施済み

        # 4. ドキュメントへのリンクURLを作成（ユーザー自身のドライブに作成されるため、追加の権限設定は不要）
        doc_url = f"https://docs.google.com/document/d/{doc_id}/edit"

        return {
            "success": True,
            "doc_url": doc_url,
            "doc_id": doc_id,
            "title": title,
            "error": None
        }

    except Exception as e:
        error_msg = str(e)
        return {
            "success": False,
            "doc_url": "",
            "doc_id": "",
            "error": f"Google Docs への保存に失敗しました: {error_msg}"
        }
