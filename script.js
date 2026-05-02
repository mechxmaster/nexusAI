/* ============================================================
   NexusAI — script.js
   Gemini API powered chat with text, image & voice support
   ============================================================ */

'use strict';

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Default: gemini-2.5-flash is FREE and widely available
let GEMINI_MODEL = localStorage.getItem('nexusai_model') || 'gemini-2.5-flash';

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let apiKey            = 'AIzaSyCkNvDAnLsi72L8Ljd-NQrxbWL6axC7N2w';
let chatHistory       = [];          // {role, parts}[]
let currentImageB64   = null;        // base-64 image string
let currentImageMime  = 'image/jpeg';
let mediaStream       = null;        // for camera
let isRecording       = false;
let recognition       = null;        // SpeechRecognition instance

// ─────────────────────────────────────────────
// DOM ELEMENTS
// ─────────────────────────────────────────────
const sidebar          = document.getElementById('sidebar');
const sidebarToggle    = document.getElementById('sidebarToggle');
const menuBtn          = document.getElementById('menuBtn');
const newChatBtn       = document.getElementById('newChatBtn');
const chatArea         = document.getElementById('chatArea');
const welcomeScreen    = document.getElementById('welcomeScreen');
const messagesContainer= document.getElementById('messagesContainer');
const imagePreviewArea = document.getElementById('imagePreviewArea');
const previewImg       = document.getElementById('previewImg');
const removeImageBtn   = document.getElementById('removeImageBtn');
const messageInput     = document.getElementById('messageInput');
const sendBtn          = document.getElementById('sendBtn');
const imageUploadBtn   = document.getElementById('imageUploadBtn');
const cameraBtn        = document.getElementById('cameraBtn');
const voiceBtn         = document.getElementById('voiceBtn');
const fileInput        = document.getElementById('fileInput');
const cameraModal      = document.getElementById('cameraModal');
const closeCameraBtn   = document.getElementById('closeCameraBtn');
const cameraVideo      = document.getElementById('cameraVideo');
const cameraCanvas     = document.getElementById('cameraCanvas');
const captureBtn       = document.getElementById('captureBtn');

// Toast container
const toastContainer = createToastContainer();

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
function init() {
  // Set saved model in selector
  const modelSelect = document.getElementById('modelSelect');
  if (modelSelect) {
    modelSelect.value = GEMINI_MODEL;
    // Update badge in topbar
    updateModelBadge(GEMINI_MODEL);
    modelSelect.addEventListener('change', () => {
      GEMINI_MODEL = modelSelect.value;
      localStorage.setItem('nexusai_model', GEMINI_MODEL);
      updateModelBadge(GEMINI_MODEL);
      showToast(`Model switched to ${GEMINI_MODEL} ✓`, 'success');
    });
  }

  // Suggestion cards
  document.querySelectorAll('.suggestion-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.dataset.prompt;
      messageInput.value = prompt;
      autoResize();
      updateSendBtn();
      handleSend();
    });
  });

  bindEvents();
}

function updateModelBadge(model) {
  const badge = document.getElementById('modelBadge');
  if (badge) badge.textContent = model;
}

// ─────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────
function bindEvents() {
  // Sidebar toggle
  sidebarToggle.addEventListener('click', closeSidebar);
  menuBtn.addEventListener('click', openSidebar);

  // New chat
  newChatBtn.addEventListener('click', resetChat);

  // Message input
  messageInput.addEventListener('input', () => { autoResize(); updateSendBtn(); });
  messageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });

  // Send
  sendBtn.addEventListener('click', handleSend);

  // Image upload
  imageUploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);

  // Camera
  cameraBtn.addEventListener('click', openCamera);
  closeCameraBtn.addEventListener('click', closeCamera);
  captureBtn.addEventListener('click', capturePhoto);

  // Remove image
  removeImageBtn.addEventListener('click', clearImage);

  // Voice
  voiceBtn.addEventListener('click', toggleVoice);

  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', e => {
    if (window.innerWidth < 768 && sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && e.target !== menuBtn) {
        closeSidebar();
      }
    }
  });
}

// ─────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────
function openSidebar()  { sidebar.classList.add('open'); }
function closeSidebar() { sidebar.classList.remove('open'); }

// ─────────────────────────────────────────────
// INPUT HELPERS
// ─────────────────────────────────────────────
function autoResize() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + 'px';
}

function updateSendBtn() {
  const hasText  = messageInput.value.trim().length > 0;
  const hasImage = currentImageB64 !== null;
  if (hasText || hasImage) {
    sendBtn.classList.add('enabled');
    sendBtn.disabled = false;
  } else {
    sendBtn.classList.remove('enabled');
    sendBtn.disabled = true;
  }
}

// ─────────────────────────────────────────────
// IMAGE HANDLING
// ─────────────────────────────────────────────
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'error'); return; }
  loadImage(file);
  fileInput.value = '';
}

function loadImage(blob) {
  const reader = new FileReader();
  reader.onload = ev => {
    const result   = ev.target.result;
    const mime     = blob.type || 'image/jpeg';
    // Split out base64 data
    currentImageB64  = result.split(',')[1];
    currentImageMime = mime;
    previewImg.src   = result;
    imagePreviewArea.style.display = 'flex';
    updateSendBtn();
    showToast('Image attached! 🖼️', 'info');
  };
  reader.readAsDataURL(blob);
}

function clearImage() {
  currentImageB64  = null;
  currentImageMime = 'image/jpeg';
  previewImg.src   = '';
  imagePreviewArea.style.display = 'none';
  updateSendBtn();
}

// ─────────────────────────────────────────────
// CAMERA
// ─────────────────────────────────────────────
async function openCamera() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    cameraVideo.srcObject = mediaStream;
    cameraModal.style.display = 'grid';
  } catch (err) {
    showToast('Camera access denied or not available', 'error');
    console.error('[Camera]', err);
  }
}

function closeCamera() {
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  cameraVideo.srcObject = null;
  cameraModal.style.display = 'none';
}

function capturePhoto() {
  const w = cameraVideo.videoWidth;
  const h = cameraVideo.videoHeight;
  cameraCanvas.width  = w;
  cameraCanvas.height = h;
  cameraCanvas.getContext('2d').drawImage(cameraVideo, 0, 0, w, h);
  cameraCanvas.toBlob(blob => {
    if (!blob) { showToast('Failed to capture photo', 'error'); return; }
    loadImage(blob);
    closeCamera();
  }, 'image/jpeg', 0.92);
}

// ─────────────────────────────────────────────
// VOICE INPUT
// ─────────────────────────────────────────────
function toggleVoice() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Voice input not supported in this browser. Try Chrome.', 'error');
    return;
  }

  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous    = false;
  recognition.interimResults = true;
  recognition.lang          = 'en-US';

  recognition.onstart = () => {
    isRecording = true;
    voiceBtn.classList.add('active');
    voiceBtn.title = 'Stop recording';
    showToast('🎙️ Listening… Speak now', 'info');
  };

  recognition.onresult = e => {
    let transcript = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    messageInput.value = transcript;
    autoResize();
    updateSendBtn();
  };

  recognition.onend = () => {
    stopRecording();
    if (messageInput.value.trim()) {
      handleSend();
    }
  };

  recognition.onerror = err => {
    stopRecording();
    showToast(`Voice error: ${err.error}`, 'error');
  };

  recognition.start();
}

function stopRecording() {
  isRecording = false;
  voiceBtn.classList.remove('active');
  voiceBtn.title = 'Voice input';
  if (recognition) { try { recognition.stop(); } catch(_){} recognition = null; }
}

// ─────────────────────────────────────────────
// SEND MESSAGE
// ─────────────────────────────────────────────
async function handleSend() {
  const text     = messageInput.value.trim();
  const hasImage = currentImageB64 !== null;

  if (!text && !hasImage) return;
  if (!apiKey) {
    showToast('⚠️ Please enter your Gemini API key in the sidebar first!', 'error');
    openSidebar();
    return;
  }

  // Hide welcome, show messages
  hideWelcome();

  // Build user message parts
  const parts = [];
  if (hasImage) {
    parts.push({ inline_data: { mime_type: currentImageMime, data: currentImageB64 } });
  }
  if (text) {
    parts.push({ text });
  }

  // Show user message
  const userImageSrc = hasImage ? previewImg.src : null;
  addMessage('user', text, userImageSrc);

  // Clear inputs
  messageInput.value = '';
  autoResize();
  if (hasImage) clearImage();
  updateSendBtn();

  // Add to history (text only for multi-turn, images don't persist)
  chatHistory.push({ role: 'user', parts });

  // Show typing indicator
  const typingEl = addTypingIndicator();

  try {
    const response = await callGeminiAPI(chatHistory);
    typingEl.remove();
    const aiText = response?.candidates?.[0]?.content?.parts?.[0]?.text || 'I could not generate a response.';
    addMessage('ai', aiText);
    chatHistory.push({ role: 'model', parts: [{ text: aiText }] });
    scrollToBottom();
  } catch (err) {
    typingEl.remove();
    const errMsg = formatApiError(err);
    addMessage('ai', `❌ **Error:** ${errMsg}`);
    showToast('Request failed. Check your API key & connection.', 'error');
    console.error('[Gemini API]', err);
    // Remove the failed user turn from history
    chatHistory.pop();
  }
}

// ─────────────────────────────────────────────
// GEMINI API CALL
// ─────────────────────────────────────────────
async function callGeminiAPI(history) {
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  console.log('[NexusAI] Using model:', GEMINI_MODEL);

  const systemInstruction = {
    parts: [{
      text: `You are NexusAI, a brilliant and helpful AI assistant powered by Google Gemini. 
You are friendly, clear, and concise. Format your responses using markdown when appropriate 
(use **bold**, *italic*, lists, code blocks etc.). When analyzing images, be thorough and descriptive.
Always be helpful, accurate, and engaging.`
    }]
  };

  const body = {
    system_instruction: systemInstruction,
    contents: history,
    generationConfig: {
      temperature:     0.8,
      topK:            40,
      topP:            0.95,
      maxOutputTokens: 2048,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `HTTP ${res.status}`);
  }

  return res.json();
}

function formatApiError(err) {
  const msg = err.message || String(err);

  if (msg.includes('API_KEY_INVALID') || msg.includes('INVALID_API_KEY')) {
    return 'Invalid API key. Please check and update your Gemini API key in the sidebar.';
  }

  // Quota / rate-limit / high demand errors
  if (msg.includes('high demand')) {
    return `**Server Overloaded:** \`${GEMINI_MODEL}\` is currently receiving too many requests on the free tier. **Please select a different model** (like Gemini 2.5 Pro or Gemini 3 Flash Preview) from the sidebar.`;
  }

  if (msg.includes('QUOTA') || msg.includes('quota') || msg.includes('429') || msg.includes('limit: 0')) {
    const retryMatch = msg.match(/Please retry in ([\d.]+)s/);
    const retryInfo = retryMatch
      ? ` Please wait **${Math.ceil(parseFloat(retryMatch[1]))} seconds** then try again.`
      : ' Please wait a moment and retry.';

    const isFreeLimit = msg.includes('free_tier') || msg.includes('limit: 0');
    if (isFreeLimit) {
      return `**Free tier quota exceeded** for model \`${GEMINI_MODEL}\`. Try switching to **gemini-1.5-flash** in the sidebar Model Selector, which has the best free tier support.${retryInfo}`;
    }
    return `API quota / rate limit exceeded.${retryInfo} Check your usage at [ai.dev/rate-limits](https://ai.dev/rate-limit).`;
  }

  if (msg.includes('400')) {
    return 'Bad request — the message may be too long or contain unsupported content.';
  }
  if (msg.includes('403')) {
    return 'Permission denied. Make sure your API key has access to the selected model.';
  }
  if (msg.includes('500') || msg.includes('503')) {
    return 'Gemini server error. Please try again in a few seconds.';
  }
  return msg;
}

// ─────────────────────────────────────────────
// RENDER MESSAGES
// ─────────────────────────────────────────────
function addMessage(role, text, imageSrc = null) {
  const isAI = role === 'ai';

  const msgEl = document.createElement('div');
  msgEl.className = `message ${isAI ? 'ai-message' : 'user-message'}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = isAI ? '✦' : '👤';

  const content = document.createElement('div');
  content.className = 'message-content';

  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = isAI ? 'NexusAI' : 'You';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  // Render image if attached
  if (imageSrc) {
    const img = document.createElement('img');
    img.src = imageSrc;
    img.alt = 'Attached image';
    bubble.appendChild(img);
    if (text) bubble.appendChild(document.createElement('br'));
  }

  // Render text (markdown for AI, plain for user)
  if (text) {
    if (isAI) {
      bubble.innerHTML += parseMarkdown(text);
    } else {
      const p = document.createElement('p');
      p.textContent = text;
      bubble.appendChild(p);
    }
  }

  content.appendChild(label);
  content.appendChild(bubble);
  msgEl.appendChild(avatar);
  msgEl.appendChild(content);

  messagesContainer.appendChild(msgEl);
  scrollToBottom();
  return msgEl;
}

function addTypingIndicator() {
  const msgEl = document.createElement('div');
  msgEl.className = 'message ai-message';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = '✦';

  const content = document.createElement('div');
  content.className = 'message-content';

  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = 'NexusAI';

  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.className = 'typing-dot';
    indicator.appendChild(dot);
  }

  content.appendChild(label);
  content.appendChild(indicator);
  msgEl.appendChild(avatar);
  msgEl.appendChild(content);

  messagesContainer.appendChild(msgEl);
  scrollToBottom();
  return msgEl;
}

// ─────────────────────────────────────────────
// MARKDOWN PARSER (lightweight)
// ─────────────────────────────────────────────
function parseMarkdown(text) {
  // Escape HTML first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (must come before inline code)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // Unordered lists
  html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr/>');

  // Paragraphs (double newline → paragraph break)
  html = html.split(/\n{2,}/).map(block => {
    if (/^<(h[1-3]|ul|ol|li|pre|hr)/.test(block.trim())) return block;
    return `<p>${block.replace(/\n/g, '<br/>')}</p>`;
  }).join('');

  return html;
}

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────
function hideWelcome() {
  if (welcomeScreen && welcomeScreen.style.display !== 'none') {
    welcomeScreen.style.display = 'none';
  }
}

function scrollToBottom() {
  chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
}

function resetChat() {
  chatHistory = [];
  messagesContainer.innerHTML = '';
  welcomeScreen.style.display = '';
  clearImage();
  messageInput.value = '';
  autoResize();
  updateSendBtn();
  showToast('New conversation started ✨', 'info');
  closeSidebar();
}

// ─────────────────────────────────────────────
// TOAST NOTIFICATIONS
// ─────────────────────────────────────────────
function createToastContainer() {
  const container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
