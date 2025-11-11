import { useEffect, useMemo, useRef, useState } from 'react';
import { toBlob, toPng } from 'html-to-image';
import './App.css';

const getDefaultForm = () => {
  const defaultDate = new Date().toLocaleDateString('he-IL');
  return {
    date: defaultDate,
    from: '',
    amount: '',
  };
};

const initializeSignatureCanvas = (canvas) => {
  const context = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;

  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;

  if (typeof context.resetTransform === 'function') {
    context.resetTransform();
  } else {
    context.setTransform(1, 0, 0, 1, 0, 0);
  }

  context.scale(ratio, ratio);
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.lineWidth = 2.8;
  context.strokeStyle = '#2c1c08';
  context.fillStyle = '#fffbf3';
  context.clearRect(0, 0, rect.width, rect.height);
  context.fillRect(0, 0, rect.width, rect.height);
};

function App() {
  const [formData, setFormData] = useState(getDefaultForm);
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [shareSupported, setShareSupported] = useState(false);

  const receiptRef = useRef(null);
  const signatureCanvasRef = useRef(null);
  const drawingStateRef = useRef({ drawing: false });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      setShareSupported(false);
      return;
    }

    if (typeof navigator.share !== 'function') {
      setShareSupported(false);
      return;
    }

    if (typeof navigator.canShare !== 'function') {
      setShareSupported(true);
      return;
    }

    try {
      if (typeof File === 'undefined') {
        setShareSupported(false);
        return;
      }
      const testFile = new File(['בדיקה'], 'share-test.png', {
        type: 'image/png',
      });
      setShareSupported(navigator.canShare({ files: [testFile] }));
    } catch (error) {
      setShareSupported(false);
    }
  }, []);

  useEffect(() => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) {
      return undefined;
    }

    initializeSignatureCanvas(canvas);

    const getCanvasPosition = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const handlePointerDown = (event) => {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      const context = canvas.getContext('2d');
      const { x, y } = getCanvasPosition(event);

      context.beginPath();
      context.moveTo(x, y);
      drawingStateRef.current.drawing = true;
    };

    const handlePointerMove = (event) => {
      if (!drawingStateRef.current.drawing) {
        return;
      }

      event.preventDefault();
      const context = canvas.getContext('2d');
      const { x, y } = getCanvasPosition(event);

      context.lineTo(x, y);
      context.stroke();
    };

    const handlePointerUp = (event) => {
      if (!drawingStateRef.current.drawing) {
        return;
      }

      event.preventDefault();
      drawingStateRef.current.drawing = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      setSignatureDataUrl(canvas.toDataURL('image/png'));
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointerleave', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  const displayDate = useMemo(() => {
    return formData.date.trim() || '—';
  }, [formData.date]);

  const formattedAmount = useMemo(() => {
    if (!formData.amount) {
      return '—';
    }

    const numericValue = Number(formData.amount);
    if (Number.isNaN(numericValue)) {
      return formData.amount;
    }

    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 2,
    }).format(numericValue);
  }, [formData.amount]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleReset = () => {
    setFormData(getDefaultForm());
    const canvas = signatureCanvasRef.current;
    if (canvas) {
      initializeSignatureCanvas(canvas);
    }
    setSignatureDataUrl('');
  };

  const handleExportImage = async () => {
    if (!receiptRef.current) {
      return;
    }

    setIsGeneratingImage(true);

    try {
      const dataUrl = await toPng(receiptRef.current, {
        cacheBust: true,
        backgroundColor: '#fffbf3',
      });

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `receipt-${Date.now()}.png`;
      link.click();
    } catch (error) {
      // eslint-disable-next-line no-alert
      alert('לא הצלחנו להוריד את התמונה. נסה שוב.');
      // eslint-disable-next-line no-console
      console.error('Export image failed', error);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleShareImage = async () => {
    if (!shareSupported || !receiptRef.current) {
      return;
    }

    setIsGeneratingImage(true);

    try {
      const blob = await toBlob(receiptRef.current, {
        cacheBust: true,
        backgroundColor: '#fffbf3',
      });

      if (!blob) {
        throw new Error('Blob generation failed');
      }

      const file = new File([blob], `receipt-${Date.now()}.png`, {
        type: blob.type || 'image/png',
      });

      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        throw new Error('Unsupported share payload');
      }

      await navigator.share({
        files: [file],
        title: 'קבלה',
        text: 'הקבלה מוכנה לשיתוף.',
      });
    } catch (error) {
      // eslint-disable-next-line no-alert
      alert('שיתוף התמונה לא נתמך במכשיר זה.');
      // eslint-disable-next-line no-console
      console.error('Share image failed', error);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) {
      return;
    }
    initializeSignatureCanvas(canvas);
    setSignatureDataUrl('');
  };

  return (
    <div className="app-shell">
      <main className="layout">
        <section className="form-panel">
          <h1>מחולל קבלות</h1>
          <p className="subtitle">
            מלא את הפרטים כדי לראות תצוגה מקדימה של הקבלה ולייצא אותה כתמונה.
          </p>
          <form
            className="form-fields"
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="field">
              <span className="field-label">תאריך</span>
              <input
                type="text"
                name="date"
                value={formData.date}
                onChange={handleChange}
                placeholder="לדוגמה: ‎12.11.2025"
              />
            </label>
            <label className="field">
              <span className="field-label">עבור</span>
              <input
                type="text"
                name="from"
                value={formData.from}
                onChange={handleChange}
                placeholder="שם המשלם או הלקוח"
                autoComplete="name"
              />
            </label>
            <label className="field">
              <span className="field-label">סכום</span>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </label>
            <div className="field signature-field">
              <span className="field-label">חתימה</span>
              <div
                className={`signature-wrapper${
                  signatureDataUrl ? ' has-signature' : ''
                }`}
              >
                <canvas ref={signatureCanvasRef} className="signature-canvas" />
                {!signatureDataUrl && (
                  <span className="signature-hint">צייר כאן את החתימה</span>
                )}
              </div>
              <div className="signature-actions">
                <button
                  type="button"
                  onClick={clearSignature}
                  className="ghost"
                >
                  נקה חתימה
                </button>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" onClick={handleReset}>
                אפס טופס
              </button>
              <button
                type="button"
                onClick={handleExportImage}
                className="primary"
                disabled={isGeneratingImage}
              >
                {isGeneratingImage ? 'מייצר...' : 'ייצא כתמונה'}
              </button>
            </div>
            {shareSupported && (
              <button
                type="button"
                className="share-button"
                onClick={handleShareImage}
                disabled={isGeneratingImage}
              >
                שתף לאפליקציה אחרת
              </button>
            )}
          </form>
        </section>

        <section className="preview-panel">
          <div className="receipt-card" ref={receiptRef}>
            <div className="receipt-header">
              <h2>קבלה</h2>
              <p className="receipt-date">{displayDate}</p>
            </div>
            <div className="receipt-body">
              <div className="receipt-row">
                <span className="receipt-label">עבור</span>
                <span className="receipt-value">
                  {formData.from.trim() || '—'}
                </span>
              </div>
              <div className="receipt-row amount-row">
                <span className="receipt-label">סכום</span>
                <span className="receipt-value emphasis">
                  {formattedAmount}
                </span>
              </div>
            </div>
            <div className="receipt-footer">
              <span className="signature-label">חתימה</span>
              <div className="signature-line" aria-hidden="true" />
              <div className="signature-display">
                {signatureDataUrl ? (
                  <img src={signatureDataUrl} alt="חתימה מצוירת" />
                ) : (
                  <span className="signature-placeholder" />
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
