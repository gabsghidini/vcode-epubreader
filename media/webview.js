/* global ePub, acquireVsCodeApi */
const vscode = acquireVsCodeApi();

let rendition, book, currentBookUri;

const openButton = document.getElementById('open');
openButton.addEventListener('click', () => {
  console.log('webview: open click -> posting openFile');
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

// Chapter info
const chapterInfo = document.createElement('span');
chapterInfo.id = 'chapter-info';
chapterInfo.style.fontSize = '11px';
chapterInfo.style.opacity = '0.7';

const toolbar = document.getElementById('toolbar');
toolbar.insertBefore(btnPrev, document.getElementById('book-title'));
toolbar.insertBefore(btnNext, document.getElementById('book-title'));
toolbar.appendChild(chapterInfo);
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
    console.log('webview: openSidebar click -> posting openInSidebar');
    openSidebarButton.disabled = true;
    vscode.postMessage({ command: 'openInSidebar' });
  });
}

window.addEventListener('message', event => {
  const message = event.data;
  // Only log explicit extension messages to avoid noise from internal libraries
  if (message && (message.command === 'loadBook' || message.command === 'status')) {
    console.log('webview: message received', message);
  }
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
        // Optionally close the panel or give feedback
        // show short success notice
        console.log('webview: sidebar opened successfully');
      } else if (message.status === 'failed') {
        if (typeof openSidebarButton !== 'undefined' && openSidebarButton) {
          openSidebarButton.disabled = false;
        }
        console.warn('webview: failed to open sidebar');
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
    
    await rendition.display();
    titleEl.textContent = bookMsg.name;

    if (lastLocation) {
      try { await rendition.display(lastLocation); } catch (err) { console.warn(err); }
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
      
      // Update chapter info
      const section = book.spine.get(cfi);
      if (section) {
        section.load(book.load.bind(book)).then(() => {
          const navItem = book.navigation.get(section.href);
          if (navItem && navItem.label) {
            document.getElementById('chapter-info').textContent = navItem.label.trim();
          }
        });
      }
    });

    // Generate locations for progress tracking
    book.ready.then(() => {
      return book.locations.generate(1024);
    }).catch(err => console.warn('Could not generate locations:', err));

  } catch (err) {
    titleEl.textContent = '❌ Erro ao carregar';
    displayError('Erro ao carregar EPUB: ' + err.message);
  }

  rendition.on('relocated', (loc) => {
    const cfi = loc.start.cfi;
    vscode.postMessage({ command: 'saveLocation', location: cfi, path: currentBookUri });
  });

  book.on('book:error', (err) => {
    console.error('book:error', err);
    displayError(err);
  });
  book.on('error', (err) => {
    console.error('book:error', err);
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
