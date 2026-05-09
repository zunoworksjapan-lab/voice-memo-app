/**
 * 音声メモ PWA - フロントエンド ロジック
 * テキスト送信、結果表示、履歴管理、PWAインストール案内
 */

// ============================================
// 設定
// ============================================

// バックエンドのURL（デプロイ後に変更）
const API_BASE_URL = window.location.hostname === "localhost"
  ? "http://localhost:5001"
  : "https://voice-memo-api.onrender.com";

// Google OAuth クライアントID
const GOOGLE_CLIENT_ID = "438431742480-c06pufh218btld2sougnieodprr5on4u.apps.googleusercontent.com";

const MAX_CHARS = 5000;
let accessToken = null;
let tokenClient;

// ============================================
// DOM 要素の取得
// ============================================
const textInput = document.getElementById("text-input");
const titleInput = document.getElementById("title-input");
const submitBtn = document.getElementById("submit-btn");
const charCount = document.getElementById("char-count");
const resultSection = document.getElementById("result-section");
const resultCard = document.getElementById("result-card");
const historySection = document.getElementById("history-section");
const historyList = document.getElementById("history-list");
const historyClearBtn = document.getElementById("history-clear");
const installBanner = document.getElementById("install-banner");
const installDismiss = document.getElementById("install-dismiss");
const toastEl = document.getElementById("toast");

// ============================================
// Service Worker 登録
// ============================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("Service Worker registered:", reg.scope))
      .catch((err) => console.log("Service Worker registration failed:", err));
  });
}

// ============================================
// Google OAuth の初期化
// ============================================
window.onload = function () {
  if (window.google) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.file",
      callback: (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          accessToken = tokenResponse.access_token;
          // トークン取得後に送信処理を実行
          processAndSaveText();
        }
      },
    });
  }
};

// ============================================
// テキスト入力の文字数カウント
// ============================================
function updateCharCount() {
  const count = textInput.value.length;
  charCount.textContent = `${count} / ${MAX_CHARS}`;

  if (count > MAX_CHARS * 0.9) {
    charCount.classList.add("warning");
  } else {
    charCount.classList.remove("warning");
  }

  // ボタンの有効/無効
  submitBtn.disabled = count === 0 || count > MAX_CHARS;
}

textInput.addEventListener("input", updateCharCount);
updateCharCount();

// ============================================
// フォーム送信処理
// ============================================
submitBtn.addEventListener("click", () => {
  const text = textInput.value.trim();
  if (!text) return;

  // すでにアクセストークンがあればそのまま処理
  if (accessToken) {
    processAndSaveText();
  } else {
    // なければGoogle認証ポップアップを表示
    if (tokenClient) {
      tokenClient.requestAccessToken();
    } else {
      showError("Googleログインの初期化に失敗しました。ページを再読み込みしてください。");
    }
  }
});

async function processAndSaveText() {
  const text = textInput.value.trim();
  if (!text || !accessToken) return;

  // ローディング状態にする
  setLoading(true);
  hideResult();

  try {
    const response = await fetch(`${API_BASE_URL}/api/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text,
        title: titleInput.value.trim() || null,
        access_token: accessToken
      })
    });

    const data = await response.json();

    if (data.success) {
      showSuccess(data);
      saveToHistory(data);
      // 入力をクリア
      textInput.value = "";
      titleInput.value = "";
      updateCharCount();
    } else {
      // 認証エラーの場合はトークンをクリア
      if (response.status === 401) {
        accessToken = null;
      }
      showError(data.error || "不明なエラーが発生しました。", data.formatted_text);
    }
  } catch (error) {
    console.error("Request failed:", error);
    showError("サーバーに接続できません。ネットワーク接続を確認してください。");
  } finally {
    setLoading(false);
  }
}

// ============================================
// UI状態管理
// ============================================
function setLoading(isLoading) {
  if (isLoading) {
    submitBtn.classList.add("loading");
    submitBtn.disabled = true;
    textInput.disabled = true;
    titleInput.disabled = true;
  } else {
    submitBtn.classList.remove("loading");
    submitBtn.disabled = false;
    textInput.disabled = false;
    titleInput.disabled = false;
  }
}

function hideResult() {
  resultSection.classList.remove("visible");
}

function showSuccess(data) {
  resultCard.className = "result-card success";
  resultCard.innerHTML = `
    <div class="result-header">
      <span class="result-icon">✅</span>
      <span>保存しました！</span>
    </div>
    <p class="result-title-text">📄 ${escapeHtml(data.title)}</p>
    <a href="${escapeHtml(data.doc_url)}" target="_blank" rel="noopener noreferrer" class="doc-link" id="doc-link">
      <span class="link-icon">📎</span>
      <span>Google ドキュメントを開く</span>
    </a>
    <div class="preview-section">
      <button class="preview-toggle" id="preview-toggle" onclick="togglePreview()">
        <span class="chevron">▶</span>
        <span>整形済みテキストを確認</span>
      </button>
      <div class="preview-content" id="preview-content">${escapeHtml(data.formatted_text)}</div>
    </div>
  `;
  resultSection.classList.add("visible");
  showToast("ドキュメントを保存しました 🎉");
}

function showError(message, formattedText = null) {
  let html = `
    <div class="result-header">
      <span class="result-icon">❌</span>
      <span>エラー</span>
    </div>
    <p class="error-message">${escapeHtml(message)}</p>
  `;

  // 整形は成功したがDocs保存に失敗した場合
  if (formattedText) {
    html += `
      <div class="preview-section">
        <button class="preview-toggle" id="preview-toggle" onclick="togglePreview()">
          <span class="chevron">▶</span>
          <span>整形済みテキスト（コピーして使用できます）</span>
        </button>
        <div class="preview-content" id="preview-content">${escapeHtml(formattedText)}</div>
      </div>
    `;
  }

  resultCard.className = "result-card error";
  resultCard.innerHTML = html;
  resultSection.classList.add("visible");
}

// ============================================
// プレビュートグル
// ============================================
function togglePreview() {
  const toggle = document.getElementById("preview-toggle");
  const content = document.getElementById("preview-content");

  if (toggle && content) {
    toggle.classList.toggle("open");
    content.classList.toggle("visible");
  }
}

// ============================================
// 履歴管理（localStorage）
// ============================================
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem("voiceMemoHistory") || "[]");
  } catch {
    return [];
  }
}

function saveToHistory(data) {
  const history = getHistory();
  history.unshift({
    title: data.title,
    url: data.doc_url,
    date: new Date().toLocaleDateString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  });

  // 最大20件保持
  if (history.length > 20) history.pop();

  localStorage.setItem("voiceMemoHistory", JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = getHistory();

  if (history.length === 0) {
    historySection.style.display = "none";
    return;
  }

  historySection.style.display = "block";
  historyList.innerHTML = history
    .map(
      (item) => `
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="history-item">
        <span class="doc-icon">📄</span>
        <span class="doc-title">${escapeHtml(item.title)}</span>
        <span class="doc-date">${escapeHtml(item.date)}</span>
      </a>
    `
    )
    .join("");
}

historyClearBtn.addEventListener("click", () => {
  if (confirm("履歴をすべて削除しますか？")) {
    localStorage.removeItem("voiceMemoHistory");
    renderHistory();
    showToast("履歴を削除しました");
  }
});

// 初回レンダリング
renderHistory();

// ============================================
// PWA インストール案内（iOSのみ）
// ============================================
function checkInstallBanner() {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone =
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  const dismissed = localStorage.getItem("installBannerDismissed");

  if (isIOS && !isStandalone && !dismissed) {
    installBanner.classList.add("visible");
  }
}

installDismiss.addEventListener("click", () => {
  installBanner.classList.remove("visible");
  localStorage.setItem("installBannerDismissed", "true");
});

checkInstallBanner();

// ============================================
// Toast 通知
// ============================================
let toastTimeout;
function showToast(message) {
  clearTimeout(toastTimeout);
  toastEl.textContent = message;
  toastEl.classList.add("show");
  toastTimeout = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 3000);
}

// ============================================
// ユーティリティ
// ============================================
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// キーボードショートカット（Cmd/Ctrl+Enter で送信）
textInput.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    submitBtn.click();
  }
});
