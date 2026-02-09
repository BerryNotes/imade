import React from 'react';

function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(160deg,#1a1a30,#141425)",border:"1px solid #2a2a45",borderRadius:20,padding:32,width:"90%",maxWidth:500,boxShadow:"0 24px 64px rgba(0,0,0,0.5)",animation:"modalIn 0.3s ease-out",maxHeight:"90vh",overflowY:"auto"}}>
        {children}
      </div>
    </div>
  );
}

export default Modal;
