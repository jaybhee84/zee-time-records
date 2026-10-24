import React, { useEffect, useRef, useState } from 'react';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import './DTRPdfPreview.css';

export default function DTRPdfPreview({ url, printers, printer, onPrinter, paperSize, printing, onPrint }) {
  const [doc, setDoc] = useState(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(0.8);
  const [error, setError] = useState('');
  const [copies, setCopies] = useState(1);
  const [pages, setPages] = useState('');
  const [monochrome, setMonochrome] = useState(false);
  const [scale, setScale] = useState('noscale');
  const canvas = useRef(null);
  const stage = useRef(null);
  const preview = useRef(null);
  const validPages = !pages.trim() || pages.split(',').every(part => {
    const match = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    return match && Number(match[1]) >= 1 && Number(match[2] || match[1]) >= Number(match[1]) && Number(match[2] || match[1]) <= (doc?.numPages || 0);
  });

  useEffect(() => {
    let task;
    let active = true;
    setError('');
    setDoc(null);
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        task = pdfjs.getDocument({ url, isEvalSupported: false });
        const value = await task.promise;
        if (active) { setDoc(value); setPage(1); }
      } catch (err) { if (active) setError(err.message); }
    })();
    return () => { active = false; task?.destroy(); };
  }, [url]);

  useEffect(() => {
    if (!doc) return;
    let active = true;
    let render;
    doc.getPage(page).then(pdfPage => {
      if (!active || !canvas.current) return;
      const viewport = pdfPage.getViewport({ scale: zoom });
      const element = canvas.current;
      const ratio = window.devicePixelRatio || 1;
      element.width = Math.ceil(viewport.width * ratio);
      element.height = Math.ceil(viewport.height * ratio);
      element.style.width = `${viewport.width}px`;
      element.style.height = `${viewport.height}px`;
      render = pdfPage.render({ canvasContext: element.getContext('2d'), viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      return render.promise;
    }).catch(err => { if (active && err.name !== 'RenderingCancelledException') setError(err.message); });
    return () => { active = false; render?.cancel(); };
  }, [doc, page, zoom]);

  async function fit(mode) {
    if (!doc || !stage.current) return;
    const pdfPage = await doc.getPage(page);
    const viewport = pdfPage.getViewport({ scale: 1 });
    if (!stage.current) return;
    const width = (stage.current.clientWidth - 48) / viewport.width;
    const height = (stage.current.clientHeight - 48) / viewport.height;
    setZoom(Math.max(0.1, mode === 'width' ? width : Math.min(width, height)));
  }

  useEffect(() => { if (doc) fit('page'); }, [doc]);

  useEffect(() => {
    const element = preview.current;
    if (!element) return;
    const handleWheel = event => {
      if (!event.ctrlKey || !event.deltaY) return;
      event.preventDefault();
      setZoom(value => Math.max(0.1, Math.min(4, value * (event.deltaY < 0 ? 1.1 : 1 / 1.1))));
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, []);

  return <div ref={preview} className="dtr-swiss-preview">
    <aside className="dtr-print-settings">
      <label>Printer<select value={printer} onChange={e => onPrinter(e.target.value)} disabled={printing || !printers.length}>
        {printers.length > 0 && <option value="">System default printer</option>}
        {!printers.length && <option value="">No printers found</option>}
        {printers.map(p => <option key={p.name} value={p.name}>{p.displayName || p.name}{p.isDefault ? ' (Default)' : ''}</option>)}
      </select></label>
      <label>Copies<input type="number" min="1" max="99" value={copies} onChange={e => setCopies(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} /></label>
      <label>Pages<input placeholder="All pages, or 1-3,5" value={pages} onChange={e => setPages(e.target.value)} /></label>
      {!validPages && <p role="alert">Enter valid page numbers from 1 to {doc?.numPages || 0}.</p>}
      <label>Paper size<input readOnly value={paperSize === 'FOLIO' ? 'Folio (8.5 × 13 in)' : 'A4'} /></label>
      <label>Scale<select value={scale} onChange={e => setScale(e.target.value)}><option value="shrink">Shrink to printable area</option><option value="noscale">Actual size (100%)</option></select></label>
      <label>Color<select value={monochrome ? 'mono' : 'color'} onChange={e => setMonochrome(e.target.value === 'mono')}><option value="color">Color</option><option value="mono">Grayscale</option></select></label>
      <p>The preview shows the PDF. Shrink to printable area reduces the printed size when needed to avoid clipped edges. Actual size requires margins your printer supports.</p>
      <button className="btn-primary-modern" disabled={!doc || !!error || !validPages || printing || !printers.length} onClick={() => onPrint({ copies, pages: pages.trim() || undefined, monochrome, scale })}>{printing ? 'Printing…' : 'Print'}</button>
    </aside>
    <section className="dtr-pdf-panel">
      <div className="dtr-pdf-toolbar">
        <button disabled={!doc || page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
        <span>Page {doc ? page : 0} of {doc?.numPages || 0}</span>
        <button disabled={!doc || page >= doc.numPages} onClick={() => setPage(p => p + 1)}>Next</button>
        <button aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}>−</button><span title="Ctrl + scroll to zoom">{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => setZoom(z => Math.min(4, z + 0.1))}>+</button>
        <button onClick={() => fit('width')}>Fit width</button><button onClick={() => fit('page')}>Fit page</button>
        <span className="dtr-zoom-hint">Ctrl + scroll to zoom</span>
      </div>
      <div ref={stage} className="dtr-pdf-stage">{error ? <p role="alert">{error}</p> : !doc ? <p>Loading PDF…</p> : null}<canvas ref={canvas} style={{ display: doc && !error ? 'block' : 'none' }} /></div>
    </section>
  </div>;
}
