import React from 'react';

function GenreTag({ genre, compact }) {
  if (!genre) return null;
  return (
    <span style={{
      color: "#818cf8",
      fontSize: compact ? 9 : 10,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      flexShrink: 0,
      background: "#4338ca15",
      padding: compact ? "1px 6px" : "2px 8px",
      borderRadius: 8,
    }}>
      {genre}
    </span>
  );
}

export default React.memo(GenreTag);
