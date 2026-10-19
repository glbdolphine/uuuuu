import React from 'react';
import { createPortal } from 'react-dom';
import { X, Download } from 'lucide-react';
import { ScrollLock } from './ScrollLock';

interface ImageLightboxProps {
  src: string;
  alt?: string;
  caption?: string;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ src, alt = 'Photo', caption, onClose }) => {
  return createPortal(
    <div
      className="no-print fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <ScrollLock />
      <div className="absolute top-3 right-3 sm:top-5 sm:right-5 flex items-center gap-2">
        <a
          href={src}
          download={`${(alt || 'photo').replace(/[^\w\-]+/g, '_')}.jpg`}
          onClick={(e) => e.stopPropagation()}
          className="p-2.5 rounded-full text-white/85 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
          title="Download photo"
        >
          <Download className="w-5 h-5" />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="p-2.5 rounded-full text-white/85 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
          title="Close"
          aria-label="Close photo"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <figure className="max-w-full max-h-full flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={alt}
          className="max-w-[94vw] max-h-[82vh] sm:max-h-[86vh] object-contain rounded-xl shadow-2xl bg-white/5"
        />
        {caption && <figcaption className="text-sm text-white/85 text-center">{caption}</figcaption>}
      </figure>
    </div>,
    document.body
  );
};

export const ClickableAvatar: React.FC<{
  photoUrl?: string;
  name: string;
  initials: string;
  onOpen: () => void;
  className?: string;
  textClass?: string;
}> = ({ photoUrl, name, initials, onOpen, className = 'w-10 h-10 rounded-2xl', textClass = 'text-sm' }) => {
  if (!photoUrl) {
    return (
      <div className={`${className} bg-gradient-to-br from-brand-700 to-brand-900 text-white font-bold flex items-center justify-center shrink-0 shadow-xs ${textClass}`}>
        {initials}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={`${className} shrink-0 overflow-hidden border border-slate-200 shadow-xs bg-slate-100 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 hover:ring-2 hover:ring-brand-300 transition`}
      title="Click to view photo"
      aria-label={`View ${name}'s photo`}
    >
      <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
    </button>
  );
};
