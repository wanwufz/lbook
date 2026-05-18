export function getNewWebviewContent(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); font-size: 13px; }
.form-row { margin-bottom: 12px; }
label { display: block; margin-bottom: 4px; font-weight: 500; color: var(--vscode-editor-foreground); }
input, select, textarea { width: 100%; padding: 6px 8px; border: 1px solid var(--vscode-input-border, #ccc); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 2px; font-size: 13px; }
input:focus, select:focus, textarea:focus { outline: none; border-color: var(--vscode-focusBorder); }
textarea { font-family: 'Consolas', 'Courier New', monospace; resize: vertical; min-height: 80px; }
.btn { padding: 6px 16px; border: none; border-radius: 2px; cursor: pointer; font-size: 13px; display: inline-flex; align-items: center; gap: 4px; }
.btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.btn-primary:hover { background: var(--vscode-button-hoverBackground); }
.btn-secondary { background: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #fff); }
.btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-group { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.error-text { color: var(--vscode-errorForeground, #f44747); font-size: 12px; margin-top: 4px; }
.info-text { color: var(--vscode-textLink-foreground, #3794ff); font-size: 12px; }
.loading { display: none; align-items: center; gap: 8px; padding: 8px; color: var(--vscode-descriptionForeground); }
.loading.active { display: flex; }
.spinner { width: 16px; height: 16px; border: 2px solid var(--vscode-editor-foreground); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.section { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 12px; margin-bottom: 16px; }
.section-title { font-weight: 600; margin-bottom: 8px; font-size: 14px; }
.tree-toggle { cursor: pointer; user-select: none; display: inline-block; width: 14px; text-align: center; color: var(--vscode-descriptionForeground); }
.tree-toggle::before { content: '\\25B6'; display: inline-block; transition: transform 0.15s; }
.tree-toggle.expanded::before { transform: rotate(90deg); }
.tree-content { display: none; }
.tree-content.expanded { display: block; }
.tree-item { padding: 2px 0; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.tree-tag { color: #569cd6; }
.tree-text { color: var(--vscode-descriptionForeground); font-size: 11px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag-btn { padding: 1px 6px; font-size: 10px; border: 1px solid var(--vscode-panel-border); border-radius: 2px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); margin-left: 2px; }
.tag-btn:hover { opacity: 0.8; }
.tag-btn.directory { background: #0e639c; }
.tag-btn.content { background: #2ea043; }
.tag-btn.pagination { background: #8957e5; }
.hidden { display: none !important; }
.mb-8 { margin-bottom: 8px; }
.mt-8 { margin-top: 8px; }
</style>
</head>
<body>
<div id="app">
  <div class="section">
    <div class="section-title">书籍配置</div>
    <div class="form-row">
      <label for="title">书籍名称 *</label>
      <input type="text" id="title" placeholder="我的书籍">
      <div id="titleError" class="error-text"></div>
    </div>
    <div class="form-row">
      <label for="url">目标网址 *</label>
      <input type="text" id="url" placeholder="https://example.com">
      <div id="urlError" class="error-text"></div>
    </div>
    <div class="btn-group">
      <button class="btn btn-primary" id="fetchBtn">抓取页面</button>
    </div>
    <div id="fetchLoading" class="loading">
      <div class="spinner"></div>
      <span id="fetchStatus">正在抓取...</span>
    </div>
  </div>

  <div id="directorySection" class="section hidden">
    <div class="section-title">步骤 2：选择目录</div>
    <div id="directoryTree"></div>
    <div class="form-row mt-8">
      <label>目录列表</label>
      <select id="directorySelect">
        <option value="">-- 请先在节点上点击 [目录] --</option>
      </select>
    </div>
    <div id="dirSelectInfo" class="info-text" style="margin-top:4px;"></div>
    <div class="btn-group">
      <button class="btn btn-primary" id="fetchDirBtn" disabled>抓取目录内容</button>
    </div>
    <div id="dirLoading" class="loading">
      <div class="spinner"></div>
      <span>正在抓取目录...</span>
    </div>
  </div>

  <div id="contentSection" class="section hidden">
    <div class="section-title">步骤 3：选择正文</div>
    <div id="contentTree"></div>
    <div class="form-row mt-8">
      <label for="contentArea">正文预览</label>
      <textarea id="contentArea" placeholder="请在节点上点击 [正文] 预览内容..." readonly></textarea>
    </div>
    <div id="actionStatus" class="info-text" style="margin-top:4px;"></div>
    <div id="paginationStatus" class="info-text"></div>
    <div class="btn-group">
      <button class="btn btn-primary" id="saveBtn">保存配置</button>
      <button class="btn btn-secondary" id="cancelBtn">取消</button>
    </div>
  </div>
</div>

<script>
(function() {
  const vscode = acquireVsCodeApi();
  const state = {
    phase: 'form',
    htmlCache: {},
    directoryItems: [],
    directorySelector: '',
    contentSelector: '',
    paginationSelector: '',
    contentHtml: '',
    fetchedPageUrl: '',
    contentPageUrl: ''
  };

  const $ = (id) => document.getElementById(id);
  const titleInp = $('title');
  const urlInp = $('url');
  const titleErr = $('titleError');
  const urlErr = $('urlError');
  const fetchBtn = $('fetchBtn');
  const fetchLoading = $('fetchLoading');
  const fetchStatus = $('fetchStatus');
  const dirSection = $('directorySection');
  const dirTree = $('directoryTree');
  const dirSelect = $('directorySelect');
  const dirSelectInfo = $('dirSelectInfo');
  const fetchDirBtn = $('fetchDirBtn');
  const dirLoading = $('dirLoading');
  const contentSection = $('contentSection');
  const contentTree = $('contentTree');
  const contentArea = $('contentArea');
  const pagStatus = $('paginationStatus');
  const actionStatus = $('actionStatus');
  const saveBtn = $('saveBtn');
  const cancelBtn = $('cancelBtn');

  function showError(el, msg) { if (el) el.textContent = msg; }
  function clearError(el) { if (el) el.textContent = ''; }

  function validateUrl(url) {
    try { new URL(url); return true; } catch { return false; }
  }

  titleInp.addEventListener('input', () => clearError(titleErr));
  urlInp.addEventListener('input', () => clearError(urlErr));

  fetchBtn.addEventListener('click', () => {
    const title = titleInp.value.trim();
    const url = urlInp.value.trim();
    let valid = true;

    if (!title) { showError(titleErr, '书籍名称不能为空'); valid = false; }
    else { clearError(titleErr); }

    if (!url) { showError(urlErr, '网址不能为空'); valid = false; }
    else if (!validateUrl(url)) { showError(urlErr, '网址格式无效'); valid = false; }
    else { clearError(urlErr); }

    if (!valid) return;

    fetchBtn.disabled = true;
    fetchLoading.classList.add('active');
    fetchStatus.textContent = '正在抓取...';
    state.fetchedPageUrl = url;

    vscode.postMessage({ type: 'fetch-dom-tree', url });
  });

  dirSelect.addEventListener('change', () => {
    fetchDirBtn.disabled = !dirSelect.value;
  });

  fetchDirBtn.addEventListener('click', () => {
    const link = dirSelect.value;
    if (!link) return;
    state.contentPageUrl = link;
    fetchDirBtn.disabled = true;
    dirLoading.classList.add('active');
    contentSection.classList.add('hidden');
    contentTree.innerHTML = '';
    contentArea.value = '';
    actionStatus.textContent = '';
    vscode.postMessage({ type: 'fetch-directory-content', link });
  });

  saveBtn.addEventListener('click', () => {
    const title = titleInp.value.trim();
    const url = urlInp.value.trim();

    if (!title) { showError(titleErr, '书籍名称不能为空'); return; }
    if (!url) { showError(urlErr, '网址不能为空'); return; }

    if (!state.directorySelector) {
      actionStatus.textContent = '请先在目录页面标记 [目录] 节点';
      return;
    }

    const config = {
      title: title,
      link: url,
      catalogSelector: state.directorySelector,
      contentSelector: state.contentSelector || '',
      paginationSelector: state.paginationSelector || '',
      items: state.directoryItems
    };

    vscode.postMessage({ type: 'save-config', config });
  });

  cancelBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'progress', message: 'cancel' });
  });

  // ─── DOM 树渲染（参考 DEMO 实现） ───
  const btnLabels = { directory: '作为目录规则', content: '作为正文规则', pagination: '作为分页规则' };

  function renderTree(container, nodes, pageUrl) {
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    nodes.forEach(n => renderNode(wrapper, n, 0, pageUrl));
    container.appendChild(wrapper);
  }

  function renderNode(container, node, depth, pageUrl) {
    const item = document.createElement('div');
    item.className = 'tree-item';

    let contentEl = null;

    // 缩进：depth * 16px 空白占位
    const indent = document.createElement('span');
    indent.style.width = (depth * 16) + 'px';
    indent.style.display = 'inline-block';
    item.appendChild(indent);

    // 展开/折叠按钮
    if (node.children && node.children.length > 0) {
      const toggle = document.createElement('span');
      toggle.className = 'tree-toggle';
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('expanded');
        if (contentEl) {
          contentEl.classList.toggle('expanded');
        }
      });
      item.appendChild(toggle);
    } else {
      const spacer = document.createElement('span');
      spacer.style.width = '14px';
      spacer.style.display = 'inline-block';
      item.appendChild(spacer);
    }

    // 标签名
    const tag = document.createElement('span');
    tag.className = 'tree-tag';
    tag.textContent = '<' + node.tagName + '>';
    item.appendChild(tag);

    // 文本摘要
    if (node.textContent) {
      const txt = document.createElement('span');
      txt.className = 'tree-text';
      txt.textContent = node.textContent.substring(0, 60);
      item.appendChild(txt);
    }

    // 操作按钮（根据 phaseActions 动态生成）
    const actions = node.phaseActions || [];
    actions.forEach(action => {
      const btn = document.createElement('button');
      btn.className = 'tag-btn ' + action;
      btn.textContent = btnLabels[action] || action;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleNodeAction(node, action, pageUrl);
      });
      item.appendChild(btn);
    });

    item.title = node.selector;
    container.appendChild(item);

    // 子节点
    if (node.children && node.children.length > 0) {
      contentEl = document.createElement('div');
      contentEl.className = 'tree-content';
      node.children.forEach(c => renderNode(contentEl, c, depth + 1, pageUrl));
      container.appendChild(contentEl);
    }
  }

  function assignPhaseActions(nodes, actions) {
    nodes.forEach(n => {
      n.phaseActions = actions;
      if (n.children) assignPhaseActions(n.children, actions);
    });
  }

  function handleNodeAction(node, action, pageUrl) {
    if (action === 'directory') {
      state.directorySelector = node.selector;
      vscode.postMessage({ type: 'mark-as-directory', selector: node.selector, pageUrl: pageUrl });
    } else if (action === 'content') {
      state.contentSelector = node.selector;
      vscode.postMessage({ type: 'mark-as-content', selector: node.selector, pageUrl: pageUrl });
    } else if (action === 'pagination') {
      state.paginationSelector = node.selector;
      vscode.postMessage({ type: 'mark-as-pagination', selector: node.selector, pageUrl });
    }
  }

  // ─── 消息处理 ───
  window.addEventListener('message', event => {
    const msg = event.data;
    switch (msg.type) {
      case 'dom-tree': {
        fetchBtn.disabled = false;
        fetchLoading.classList.remove('active');
        dirLoading.classList.remove('active');
        fetchDirBtn.disabled = false;

        if (msg.phase === 'directory') {
          dirSection.classList.remove('hidden');
          contentSection.classList.add('hidden');
          dirSelect.innerHTML = '<option value="">-- 请先在节点上点击 [目录] --</option>';
          fetchDirBtn.disabled = true;
          assignPhaseActions(msg.nodes, ['directory']);
          renderTree(dirTree, msg.nodes, state.fetchedPageUrl);
          actionStatus.textContent = '在 DOM 树节点上点击 [作为目录规则]';
        } else if (msg.phase === 'content') {
          contentSection.classList.remove('hidden');
          contentArea.value = '';
          pagStatus.textContent = '';
          assignPhaseActions(msg.nodes, ['content', 'pagination']);
          renderTree(contentTree, msg.nodes, state.contentPageUrl);
          actionStatus.textContent = '在 DOM 树节点上点击 [作为正文规则] 或 [作为分页规则]';
        }
        break;
      }

      case 'config-loaded': {
        // 编辑已有配置：填充表单 + 目录项
        titleInp.value = msg.config.title || '';
        urlInp.value = msg.config.link || '';
        state.fetchedPageUrl = msg.config.link || '';

        if (msg.config.items && msg.config.items.length > 0) {
          state.directoryItems = msg.config.items;
          dirSection.classList.remove('hidden');
          dirSelect.innerHTML = '';
          const placeholder = document.createElement('option');
          placeholder.value = '';
          placeholder.textContent = '共 ' + msg.config.items.length + ' 项，选择一个查看正文';
          dirSelect.appendChild(placeholder);
          msg.config.items.forEach((item, i) => {
            const opt = document.createElement('option');
            opt.value = item.link;
            opt.textContent = (i + 1) + '. ' + item.title;
            dirSelect.appendChild(opt);
          });
          dirSelectInfo.textContent = '已提取 ' + msg.config.items.length + ' 个目录项';
          if (msg.config.items.length > 0) {
            dirSelect.selectedIndex = 1;
            fetchDirBtn.disabled = false;
          }
        }

        if (msg.config.catalogSelector) {
          state.directorySelector = msg.config.catalogSelector;
        }
        if (msg.config.contentSelector) {
          state.contentSelector = msg.config.contentSelector;
        }
        if (msg.config.paginationSelector) {
          state.paginationSelector = msg.config.paginationSelector;
        }
        actionStatus.textContent = '已加载配置，可重新抓取或直接保存';
        break;
      }

      case 'directory-items': {
        state.directoryItems = msg.items;
        dirSelect.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '共 ' + msg.items.length + ' 项，选择一个查看正文';
        dirSelect.appendChild(placeholder);
        msg.items.forEach((item, i) => {
          const opt = document.createElement('option');
          opt.value = item.link;
          opt.textContent = (i + 1) + '. ' + item.title;
          dirSelect.appendChild(opt);
        });
        if (msg.items.length > 0) {
          dirSelect.selectedIndex = 1;
          fetchDirBtn.disabled = false;
        }
        dirSelectInfo.textContent = '已提取 ' + msg.items.length + ' 个目录项';
        actionStatus.textContent = '';
        setTimeout(() => { if (actionStatus) actionStatus.textContent = ''; }, 3000);
        break;
      }

      case 'content': {
        contentArea.value = msg.html || '[未提取到内容]';
        actionStatus.textContent = '正文提取成功';
        setTimeout(() => { if (actionStatus) actionStatus.textContent = ''; }, 3000);
        break;
      }

      case 'pagination-links': {
        if (msg.links && msg.links.length > 0) {
          pagStatus.textContent = '已找到 ' + msg.links.length + ' 个分页链接';
          actionStatus.textContent = '分页规则已保存';
        } else {
          pagStatus.textContent = '';
          actionStatus.textContent = msg.links ? '未找到分页链接' : '';
        }
        setTimeout(() => { if (actionStatus) actionStatus.textContent = ''; }, 3000);
        break;
      }

      case 'save-success': {
        actionStatus.textContent = '保存成功！';
        setTimeout(() => {
          vscode.postMessage({ type: 'progress', message: 'cancel' });
        }, 1000);
        break;
      }

      case 'error': {
        fetchBtn.disabled = false;
        fetchLoading.classList.remove('active');
        fetchDirBtn.disabled = false;
        dirLoading.classList.remove('active');
        showError(titleErr, msg.message);
        break;
      }

      case 'progress': {
        if (fetchLoading.classList.contains('active')) {
          fetchStatus.textContent = msg.message;
        } else {
          actionStatus.textContent = msg.message;
        }
        break;
      }
    }
  });
})();
</script>
</body>
</html>`
}
