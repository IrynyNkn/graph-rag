import { useRef, useState, type DragEvent } from 'react';

export function useFileDrop(onFiles: (files: File[]) => void) {
  const [isDragging, setIsDragging] = useState(false);
  // Moving over a child fires leave on the parent, so only the outermost leave ends the drag.
  const depth = useRef(0);

  return {
    isDragging,
    dropTarget: {
      onDragEnter: (event: DragEvent) => {
        event.preventDefault();
        depth.current += 1;
        setIsDragging(true);
      },
      onDragOver: (event: DragEvent) => {
        event.preventDefault();
      },
      onDragLeave: () => {
        depth.current -= 1;
        if (depth.current <= 0) {
          depth.current = 0;
          setIsDragging(false);
        }
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        depth.current = 0;
        setIsDragging(false);
        const files = [...event.dataTransfer.files];
        if (files.length > 0) {
          onFiles(files);
        }
      },
    },
  };
}
