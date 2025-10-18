// WebSocket connection
let ws = null;
let isConnected = false;
let currentStreamingMessage = null;
let pendingPlan = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000; // Start with 2 seconds

// Conversation storage
const STORAGE_KEY = 'langgraph_conversation';

function saveConversation() {
    try {
        const messages = [];
        // Only save user and assistant messages, not intermediate steps
        messagesContainer.querySelectorAll('.message.user, .message.assistant').forEach(msg => {
            if (!msg.classList.contains('streaming') && !msg.classList.contains('typing-indicator-msg')) {
                const role = msg.classList.contains('user') ? 'user' : 'assistant';
                const textContent = msg.querySelector('.message-text');
                if (textContent) {
                    messages.push({
                        role,
                        content: textContent.innerHTML // Save rendered HTML for assistant, text for user
                    });
                }
            }
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (error) {
        console.error('Failed to save conversation:', error);
    }
}

function loadConversation() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const messages = JSON.parse(saved);
            messages.forEach(({ role, content }) => {
                if (role === 'user') {
                    addMessage('user', content);
                } else {
                    addRenderedMessage('assistant', content);
                }
            });
        }
    } catch (error) {
        console.error('Failed to load conversation:', error);
    }
}

function clearConversationStorage() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.error('Failed to clear conversation:', error);
    }
}

// DOM elements
const welcomeScreen = document.getElementById('welcomeScreen');
const chatInterface = document.getElementById('chatInterface');
const startChatBtn = document.getElementById('startChat');
const launchTerminalBtn = document.getElementById('launchTerminal');
const clearChatBtn = document.getElementById('clearChat');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesContainer = document.getElementById('messages');
const connectionStatus = document.getElementById('connectionStatus');
const modelInfo = document.getElementById('modelInfo');
const toast = document.getElementById('toast');
const modelSelector = document.getElementById('modelSelector');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Configure marked for markdown rendering with syntax highlighting
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            highlight: function(code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (err) {}
                }
                return hljs.highlightAuto(code).value;
            },
            breaks: true,
            gfm: true
        });
    }

    fetchModelInfo();
    loadAvailableModels();
    setupEventListeners();
});

// Fetch model information
async function fetchModelInfo() {
    try {
        const [healthRes, modelsRes] = await Promise.all([
            fetch('/api/health'),
            fetch('/api/models')
        ]);
        const health = await healthRes.json();
        const models = await modelsRes.json();
        const currentId = health.model;
        const match = (models.available || []).find(m => m.id === currentId);
        modelInfo.textContent = `Model: ${match ? match.name : currentId}`;
    } catch (error) {
        modelInfo.textContent = 'Model: Unknown';
    }
}

// Load available models
async function loadAvailableModels() {
    try {
        const response = await fetch('/api/models');
        const data = await response.json();

        // Clear existing options
        modelSelector.innerHTML = '';

        // Add options
        data.available.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            option.selected = model.id === data.current;
            modelSelector.appendChild(option);
        });

        // Add change event listener
        modelSelector.addEventListener('change', handleModelChange);

    } catch (error) {
        console.error('Failed to load models:', error);
        modelSelector.innerHTML = '<option value="">Failed to load models</option>';
    }
}

// Handle model change
async function handleModelChange(event) {
    const newModelId = event.target.value;

    try {
        showToast('Switching model...', 'info');

        const response = await fetch('/api/models', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ modelId: newModelId })
        });

        const data = await response.json();

        if (data.success) {
            showToast(`Model switched to: ${newModelId}`, 'success');
            // Update the model info display immediately using the selected option's label
            const selectedOption = event.target.options[event.target.selectedIndex];
            if (selectedOption && modelInfo) {
                modelInfo.textContent = `Model: ${selectedOption.textContent}`;
            } else {
                fetchModelInfo();
            }
        } else {
            showToast('Failed to switch model', 'error');
        }
    } catch (error) {
        console.error('Error switching model:', error);
        showToast('Error switching model', 'error');
    }
}

// Setup event listeners
function setupEventListeners() {
    startChatBtn.addEventListener('click', startChat);
    launchTerminalBtn.addEventListener('click', launchTerminal);
    clearChatBtn.addEventListener('click', clearChat);
    sendButton.addEventListener('click', sendMessage);

    messageInput.addEventListener('input', () => {
        sendButton.disabled = !messageInput.value.trim();
        autoResize(messageInput);
    });

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

// Auto-resize textarea
function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

// Start chat
function startChat() {
    welcomeScreen.classList.add('hidden');
    chatInterface.classList.remove('hidden');
    loadConversation(); // Load previous conversation
    connectWebSocket();
    messageInput.focus();
}

// Connect to WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            isConnected = true;
            reconnectAttempts = 0; // Reset on successful connection
            updateConnectionStatus('connected', 'Connected');
            showToast('Connected to AI assistant!', 'success');
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (error) {
                console.error('Error parsing message:', error);
                showToast('Error processing server message', 'error');
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateConnectionStatus('error', 'Connection error');
            removeTypingIndicator();
        };

        ws.onclose = () => {
            isConnected = false;
            updateConnectionStatus('disconnected', 'Disconnected');
            removeTypingIndicator();

            // Attempt to reconnect
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttempts); // Exponential backoff
                reconnectAttempts++;

                showToast(`Connection lost. Reconnecting in ${delay/1000}s... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, 'error');

                setTimeout(() => {
                    updateConnectionStatus('connecting', 'Reconnecting...');
                    connectWebSocket();
                }, delay);
            } else {
                showToast('Connection failed. Please refresh the page.', 'error');
            }
        };
    } catch (error) {
        console.error('Failed to create WebSocket:', error);
        showToast('Failed to connect to server', 'error');
    }
}

// Handle WebSocket messages
function handleWebSocketMessage(data) {
    const { type, content, step, classification, plan, message, toolName, toolArgs, toolId, result, error } = data;

    switch (type) {
        case 'agent-step':
            showAgentStep(step, content);
            break;

        case 'classification':
            showClassification(classification);
            break;

        case 'plan':
            showPlan(plan);
            break;

        case 'confirmation-request':
            showConfirmation(message);
            break;

        case 'tool-call':
            showToolCall(toolName, toolArgs, toolId);
            break;

        case 'tool-result':
            showToolResult(toolName, result, toolId);
            break;

        case 'tool-error':
            showToolError(toolName, error, toolId);
            break;

        case 'stream-start':
            startStreaming();
            break;

        case 'stream-chunk':
            appendStreamChunk(content);
            break;

        case 'stream-end':
            endStreaming();
            break;

        case 'error':
            removeAgentSteps();
            showToast(content, 'error');
            break;

        case 'cleared':
            messagesContainer.innerHTML = '';
            clearConversationStorage();
            showToast('Chat cleared!', 'success');
            break;
    }
}

// Show agent processing step
function showAgentStep(step, content) {
    removeAgentSteps(); // Remove previous step indicators

    const stepDiv = document.createElement('div');
    stepDiv.className = 'agent-step';
    stepDiv.id = 'current-agent-step';

    const stepLabels = {
        classification: 'ANALYZE',
        planning: 'PLAN',
        thinking: 'THINK',
        execution: 'EXECUTE'
    };

    stepDiv.innerHTML = `
        <span class="step-label">${stepLabels[step] || 'PROCESS'}</span>
        <span class="step-text">${content}</span>
        <div class="step-spinner"></div>
    `;

    messagesContainer.appendChild(stepDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Show classification result
function showClassification(classification) {
    removeAgentSteps();

    const classDiv = document.createElement('div');
    classDiv.className = 'classification-result';

    classDiv.innerHTML = `
        <div class="class-header">
            <span class="class-type">${classification.type.toUpperCase()}</span>
        </div>
        <div class="class-reasoning">${classification.reasoning}</div>
    `;

    messagesContainer.appendChild(classDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Show plan
function showPlan(plan) {
    removeAgentSteps();

    const planDiv = document.createElement('div');
    planDiv.className = 'plan-display';
    planDiv.id = 'agent-plan';

    let planHTML = '<div class="plan-header">Execution Plan</div><ol class="plan-steps">';
    plan.forEach((step, index) => {
        planHTML += `<li><span class="step-number">${index + 1}</span>${step}</li>`;
    });
    planHTML += '</ol>';

    planDiv.innerHTML = planHTML;
    messagesContainer.appendChild(planDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    pendingPlan = plan;
}

// Show confirmation dialog
function showConfirmation(message) {
    const confirmDiv = document.createElement('div');
    confirmDiv.className = 'confirmation-dialog';
    confirmDiv.id = 'confirmation-dialog';

    confirmDiv.innerHTML = `
        <div class="confirm-message">${message}</div>
        <div class="confirm-buttons">
            <button class="btn-confirm yes" onclick="confirmPlan(true)">Yes, proceed</button>
            <button class="btn-confirm no" onclick="confirmPlan(false)">No, cancel</button>
        </div>
    `;

    messagesContainer.appendChild(confirmDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Confirm or cancel plan
window.confirmPlan = function(confirmed) {
    const confirmDialog = document.getElementById('confirmation-dialog');
    if (confirmDialog) {
        confirmDialog.remove();
    }

    if (confirmed) {
        ws.send(JSON.stringify({ type: 'confirm' }));
        showToast('Executing plan...', 'success');
    } else {
        const planDiv = document.getElementById('agent-plan');
        if (planDiv) {
            planDiv.remove();
        }
        showToast('Plan cancelled', 'info');
        pendingPlan = null;
    }
};

// Show typing indicator
function showTypingIndicator() {
    // Remove any existing typing indicator
    removeTypingIndicator();

    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant typing-indicator-msg';
    typingDiv.id = 'typing-indicator';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar ai-avatar';
    avatar.textContent = 'AI';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content typing-content';

    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.innerHTML = `
        <span>AI is typing</span>
        <div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
        </div>
    `;

    contentDiv.appendChild(typingIndicator);
    typingDiv.appendChild(avatar);
    typingDiv.appendChild(contentDiv);

    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Remove typing indicator
function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

// Start streaming response
function startStreaming() {
    removeAgentSteps();
    removeTypingIndicator();

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant streaming';
    messageDiv.id = 'streaming-message';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar ai-avatar';
    avatar.textContent = 'AI';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const roleSpan = document.createElement('div');
    roleSpan.className = 'message-role';
    roleSpan.textContent = 'Assistant';

    const textDiv = document.createElement('div');
    textDiv.className = 'message-text streaming-text';
    textDiv.id = 'streaming-text';

    contentDiv.appendChild(roleSpan);
    contentDiv.appendChild(textDiv);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    currentStreamingMessage = textDiv;
}

// Append chunk to streaming response
function appendStreamChunk(chunk) {
    if (currentStreamingMessage) {
        currentStreamingMessage.textContent += chunk;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// End streaming
function endStreaming() {
    if (currentStreamingMessage) {
        currentStreamingMessage.classList.remove('streaming-text');

        // Render markdown
        const rawText = currentStreamingMessage.textContent;
        if (typeof marked !== 'undefined') {
            currentStreamingMessage.innerHTML = marked.parse(rawText);
            // Highlight code blocks
            currentStreamingMessage.querySelectorAll('pre code').forEach((block) => {
                if (typeof hljs !== 'undefined') {
                    hljs.highlightElement(block);
                }
            });
        }

        // Add copy button
        const messageContent = currentStreamingMessage.parentElement;
        if (messageContent && !messageContent.querySelector('.copy-btn')) {
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.innerHTML = 'Copy';
            copyBtn.onclick = () => copyMessageText(currentStreamingMessage, copyBtn);
            messageContent.appendChild(copyBtn);
        }
    }
    const streamingMsg = document.getElementById('streaming-message');
    if (streamingMsg) {
        streamingMsg.classList.remove('streaming');
    }
    currentStreamingMessage = null;

    // Save conversation after message is complete
    saveConversation();
}

// Remove agent step indicators
function removeAgentSteps() {
    const steps = document.querySelectorAll('.agent-step, #current-agent-step');
    steps.forEach(step => step.remove());
}

// Show tool call
function showToolCall(toolName, toolArgs, toolId) {
    removeAgentSteps();

    const toolDiv = document.createElement('div');
    toolDiv.className = 'tool-call';
    toolDiv.id = `tool-${toolId}`;

    const argsText = JSON.stringify(toolArgs, null, 2);

    toolDiv.innerHTML = `
        <div class="tool-header">
            <span class="tool-icon">⚙️</span>
            <span class="tool-name">Using: ${toolName}</span>
            <div class="tool-spinner"></div>
        </div>
        <div class="tool-args">${argsText}</div>
    `;

    messagesContainer.appendChild(toolDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Show tool result
function showToolResult(toolName, result, toolId) {
    const toolDiv = document.getElementById(`tool-${toolId}`);
    if (toolDiv) {
        const spinner = toolDiv.querySelector('.tool-spinner');
        if (spinner) {
            spinner.remove();
        }

        const resultDiv = document.createElement('div');
        resultDiv.className = 'tool-result';
        resultDiv.innerHTML = `<strong>Result:</strong> ${result}`;

        toolDiv.appendChild(resultDiv);
        toolDiv.classList.add('tool-success');
    }

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Show tool error
function showToolError(toolName, error, toolId) {
    const toolDiv = document.getElementById(`tool-${toolId}`);
    if (toolDiv) {
        const spinner = toolDiv.querySelector('.tool-spinner');
        if (spinner) {
            spinner.remove();
        }

        const errorDiv = document.createElement('div');
        errorDiv.className = 'tool-error-msg';
        errorDiv.innerHTML = `<strong>Error:</strong> ${error}`;

        toolDiv.appendChild(errorDiv);
        toolDiv.classList.add('tool-failed');
    }

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Send message
function sendMessage() {
    const message = messageInput.value.trim();

    if (!message || !isConnected) return;

    // Add user message to UI
    addMessage('user', message);

    // Show typing indicator
    showTypingIndicator();

    // Send to WebSocket
    ws.send(JSON.stringify({
        type: 'chat',
        content: message
    }));

    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendButton.disabled = true;
    messageInput.focus();
}

// Add message to chat
function addMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = `message-avatar ${role}-avatar`;
    avatar.textContent = role === 'user' ? 'U' : 'AI';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const roleSpan = document.createElement('div');
    roleSpan.className = 'message-role';
    roleSpan.textContent = role === 'user' ? 'You' : 'Assistant';

    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    textDiv.textContent = content;

    contentDiv.appendChild(roleSpan);
    contentDiv.appendChild(textDiv);

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Add message with rendered HTML (for loading from storage)
function addRenderedMessage(role, htmlContent) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = `message-avatar ${role}-avatar`;
    avatar.textContent = role === 'user' ? 'U' : 'AI';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const roleSpan = document.createElement('div');
    roleSpan.className = 'message-role';
    roleSpan.textContent = role === 'user' ? 'You' : 'Assistant';

    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    textDiv.innerHTML = htmlContent;

    contentDiv.appendChild(roleSpan);
    contentDiv.appendChild(textDiv);

    // Add copy button for assistant messages
    if (role === 'assistant') {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.innerHTML = 'Copy';
        copyBtn.onclick = () => copyMessageText(textDiv, copyBtn);
        contentDiv.appendChild(copyBtn);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Copy message text to clipboard
async function copyMessageText(textElement, button) {
    try {
        // Get plain text from the message (strip HTML)
        const text = textElement.innerText || textElement.textContent;

        await navigator.clipboard.writeText(text);

        // Show feedback
        const originalText = button.innerHTML;
        button.innerHTML = 'Copied!';
        button.classList.add('copied');

        setTimeout(() => {
            button.innerHTML = originalText;
            button.classList.remove('copied');
        }, 2000);

        showToast('Message copied to clipboard!', 'success');
    } catch (error) {
        console.error('Failed to copy:', error);
        showToast('Failed to copy message', 'error');
    }
}

// Clear chat
function clearChat() {
    if (!isConnected) {
        showToast('Not connected to server', 'error');
        return;
    }

    ws.send(JSON.stringify({ type: 'clear' }));
}

// Launch terminal
async function launchTerminal() {
    showToast('Launching terminal demo...', 'success');

    try {
        const response = await fetch('/api/launch-terminal', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            showToast('Terminal demo launched! Check your terminal.', 'success');
        } else {
            showToast('Failed to launch terminal: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Error launching terminal: ' + error.message, 'error');
    }
}

// Update connection status
function updateConnectionStatus(status, text) {
    const statusDot = connectionStatus.querySelector('.status-dot');
    const statusText = document.getElementById('statusText');

    if (statusText) {
        statusText.textContent = text;
    }

    statusDot.classList.remove('connected');
    if (status === 'connected') {
        statusDot.classList.add('connected');
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast ${type}`;

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}
