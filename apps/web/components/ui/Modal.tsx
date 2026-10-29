"use client";

import * as React from "react";
import { useEffect, useRef } from "react";
import { Button } from "./Button";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, description, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 w-full max-w-sm text-center shadow-2xl relative"
      >
        <h3 id="modal-title" className="text-lg font-semibold text-white">
          {title}
        </h3>

        {description && (
          <p className="text-neutral-400 text-sm mt-2">{description}</p>
        )}

        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Are you sure?",
  description = "This action cannot be undone.",
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = false,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} description={description}>
      <div className="flex gap-4">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={onClose}
          type="button"
        >
          {cancelText}
        </Button>
        <Button
          variant={isDestructive ? "danger" : "primary"}
          className="flex-1"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          type="button"
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}

