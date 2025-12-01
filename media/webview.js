/* global ePub, acquireVsCodeApi */
const vscode = acquireVsCodeApi();

let rendition, book, currentBookUri;

const openButton = document.getElementById('open');
openButton.addEventListener('click', () => {
  openButton.disabled = true;
  vscode.postMessage({ command: 'openFile' });
});

// navigation
const btnPrev = document.createElement('button');
btnPrev.textContent = '◀';
btnPrev.id = 'prev';
btnPrev.title = 'Página Anterior (←)';
const btnNext = document.createElement('button');
btnNext.textContent = '▶';
btnNext.id = 'next';
btnNext.title = 'Próxima Página (→)';

// Progress indicator
const progressBar = document.createElement('div');
progressBar.id = 'progress-bar';
const progressFill = document.createElement('div');
progressFill.id = 'progress-fill';
progressBar.appendChild(progressFill);

// Chapter selector
const chapterSelect = document.createElement('select');
chapterSelect.id = 'chapter-select';
chapterSelect.title = 'Selecionar Capítulo';
chapterSelect.style.maxWidth = '200px';

// Chapter info
const chapterInfo = document.createElement('span');
chapterInfo.id = 'chapter-info';
chapterInfo.style.fontSize = '11px';
chapterInfo.style.opacity = '0.7';
chapterInfo.style.display = 'none'; // Hide text info, use dropdown instead

const toolbar = document.getElementById('toolbar');
toolbar.insertBefore(btnPrev, document.getElementById('book-title'));
toolbar.insertBefore(btnNext, document.getElementById('book-title'));
toolbar.appendChild(chapterSelect);
toolbar.appendChild(progressBar);

btnPrev.addEventListener('click', () => rendition && rendition.prev());
btnNext.addEventListener('click', () => rendition && rendition.next());

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (!rendition) return;
  if (e.key === 'ArrowLeft') {
    rendition.prev();
    e.preventDefault();
  } else if (e.key === 'ArrowRight') {
    rendition.next();
    e.preventDefault();
  }
});

const openSidebarButton = document.getElementById('openSidebar');
if (openSidebarButton) {
  openSidebarButton.addEventListener('click', () => {
    openSidebarButton.disabled = true;
    vscode.postMessage({ command: 'openInSidebar' });
  });
}

window.addEventListener('message', event => {
  const message = event.data;
  switch (message.command) {
    case 'loadBook':
      loadBook(message.book, message.lastLocation);
      break;
    case 'status':
      if (message.status === 'opening') {
        openButton.disabled = true;
      } else if (message.status === 'ready') {
        openButton.disabled = false;
      }
      break;
    case 'status':
      // fallback panel messages will use same status field; re-enable sidebar button on failure or show success
      if (message.status === 'opened') {
        if (typeof openSidebarButton !== 'undefined' && openSidebarButton) {
          openSidebarButton.disabled = true;
        }
      } else if (message.status === 'failed') {
        if (typeof openSidebarButton !== 'undefined' && openSidebarButton) {
          openSidebarButton.disabled = false;
        }
      }
      break;
  }
});

async function loadBook(bookMsg, lastLocation) {
  currentBookUri = bookMsg.path;
  const titleEl = document.getElementById('book-title');
  titleEl.textContent = '📖 Carregando...';

  try {
    // Convert base64 to Uint8Array
    const binary = atob(bookMsg.base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    if (rendition) {
      rendition.destroy();
      rendition = null;
    }
    book = ePub(bytes.buffer);
    const viewer = document.getElementById('viewer');
    viewer.innerHTML = '';
    const container = document.createElement('div');
    container.id = 'epub-container';
    viewer.appendChild(container);
    rendition = book.renderTo(container, { width: '100%', height: '100%' });
    
    // Apply white text styling
    rendition.themes.default({
      'body': {
        'color': '#ffffff !important',
        'background': '#1e1e1e !important'
      },
      'p': { 'color': '#ffffff !important' },
      'h1, h2, h3, h4, h5, h6': { 'color': '#ffffff !important' },
      'span': { 'color': '#ffffff !important' },
      'div': { 'color': '#ffffff !important' },
      'a': { 'color': '#4fc3f7 !important' }
    });
    
    await rendition.display();
    titleEl.textContent = bookMsg.name;

    // Populate chapter selector
    await book.ready;
    const navigation = book.navigation;
    const chapterSelect = document.getElementById('chapter-select');
    chapterSelect.innerHTML = '<option value="">Selecione um capítulo...</option>';
    
    // Recursive function to add chapters and subchapters
    function addChaptersRecursive(chapters, level = 0) {
      chapters.forEach((chapter) => {
        const option = document.createElement('option');
        option.value = chapter.href;
        const indent = '\u00a0\u00a0'.repeat(level); // 2 spaces per level
        option.textContent = indent + chapter.label.trim();
        chapterSelect.appendChild(option);
        
        // Add subitems if they exist
        if (chapter.subitems && chapter.subitems.length > 0) {
          addChaptersRecursive(chapter.subitems, level + 1);
        }
      });
    }
    
    if (navigation && navigation.toc) {
      addChaptersRecursive(navigation.toc);
    }

    chapterSelect.addEventListener('change', (e) => {
      const href = e.target.value;
      if (href && rendition) {
        rendition.display(href);
      }
    });

    if (lastLocation) {
      try { await rendition.display(lastLocation); } catch {}
    }

    // Update progress and chapter info
    rendition.on('relocated', (loc) => {
      const cfi = loc.start.cfi;
      vscode.postMessage({ command: 'saveLocation', location: cfi, path: currentBookUri });
      
      // Update progress bar
      const progress = book.locations.percentageFromCfi(cfi);
      if (progress !== undefined) {
        const progressFill = document.getElementById('progress-fill');
        progressFill.style.width = (progress * 100) + '%';
      }
      
      // Update chapter selector
      const section = book.spine.get(cfi);
      if (section) {
        const chapterSelect = document.getElementById('chapter-select');
        const options = chapterSelect.options;
        for (let i = 0; i < options.length; i++) {
          if (section.href && options[i].value && section.href.includes(options[i].value)) {
            chapterSelect.selectedIndex = i;
            break;
          }
        }
      }
    });

    // Generate locations for progress tracking
    book.ready.then(() => {
      return book.locations.generate(1024);
    }).catch(() => {});

  } catch (err) {
    titleEl.textContent = '❌ Erro ao carregar';
    displayError('Erro ao carregar EPUB: ' + err.message);
  }

  rendition.on('relocated', (loc) => {
    const cfi = loc.start.cfi;
    vscode.postMessage({ command: 'saveLocation', location: cfi, path: currentBookUri });
  });

  book.on('book:error', (err) => {
    displayError(err);
  });
  book.on('error', (err) => {
    displayError(err);
  });


function displayError(err) {
  const viewer = document.getElementById('viewer');
  const msg = err && err.message ? err.message : String(err);
  viewer.innerHTML = `
    <div class="epub-error">
      <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
      <div style="font-size: 14px; margin-bottom: 8px;">Erro ao abrir EPUB</div>
      <div style="font-size: 12px; opacity: 0.7;">${msg}</div>
      <button onclick="document.getElementById('open').click()" style="margin-top: 20px; padding: 8px 16px;">Tentar Novamente</button>
    </div>
  `;
}
  // Keyboard navigation for convenience
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') rendition && rendition.prev();
    if (e.key === 'ArrowRight') rendition && rendition.next();
  });
}
