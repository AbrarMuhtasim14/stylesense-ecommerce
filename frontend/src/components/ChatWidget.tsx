'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { ChatMessage } from '@/lib/types';
import { sendChatMessage, uploadEvidence } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { generateSessionId, formatPrice, truncate } from '@/lib/utils';

const SUGGESTIONS = [
  'Show me green sweaters',
  'What goes with navy jeans?',
  'I need a casual summer outfit',
  'Find me something under ৳1500',
];

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(generateSessionId);
  const [showWelcome, setShowWelcome] = useState(true);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, messages, scrollToBottom]);

  const sendMessage = async (text: string) => {
    if ((!text.trim() && !selectedImage) || isLoading || isUploading) return;
    setShowWelcome(false);

    setIsLoading(true);
    let finalMessage = text.trim();

    try {
      if (selectedImage) {
        setIsUploading(true);
        const { evidence_url } = await uploadEvidence(selectedImage);
        finalMessage += finalMessage ? `\n\n[Evidence Attached: ${evidence_url}]` : `[Evidence Attached: ${evidence_url}]`;
        setIsUploading(false);
        setSelectedImage(null);
      }

      const userMsg: ChatMessage = { role: 'user', content: finalMessage, timestamp: new Date() };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');

      const currentUser = getCurrentUser();
      const response = await sendChatMessage({
        message: finalMessage,
        session_id: sessionId,
        customer_email: currentUser?.email || undefined,
        customer_name: currentUser?.name || undefined,
      });

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.reply,
        products: response.products,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "I'm having trouble connecting or uploading right now. Please try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
      setIsUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
      {/* Chat panel */}
      {isOpen && (
        <>
          <div
            style={{
              position: 'fixed',
              bottom: 88,
              right: 24,
              width: 380,
              maxWidth: 'calc(100vw - 48px)',
              height: 560,
              maxHeight: 'calc(100vh - 120px)',
              background: 'white',
              borderRadius: 24,
              boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              zIndex: 55,
              border: '1px solid #e4e4e7',
              animation: 'scaleIn 0.25s ease-out',
              transformOrigin: 'bottom right',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #d946ef 0%, #9333ea 100%)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                }}
              >
                ✦
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ color: 'white', fontWeight: 700, fontSize: 16, margin: 0 }}>
                  Style Assistant
                </h3>
                <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, margin: 0 }}>
                  Powered by Gemini AI
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {/* Welcome state */}
              {showWelcome && messages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 16px' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>👗</div>
                  <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                    Hi! I'm your Style Assistant
                  </h4>
                  <p style={{ fontSize: 13, color: '#71717a', lineHeight: 1.5, marginBottom: 20 }}>
                    I can help you find the perfect outfit, give style advice, check orders, and more.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => sendMessage(suggestion)}
                        style={{
                          padding: '8px 14px',
                          background: '#fdf4ff',
                          border: '1.5px solid #f0abfc',
                          borderRadius: 100,
                          fontSize: 12,
                          fontWeight: 500,
                          color: '#9333ea',
                          cursor: 'pointer',
                          transition: 'all 150ms',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f0abfc';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#fdf4ff';
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages list */}
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    gap: 8,
                  }}
                >
                  <div
                    className={
                      msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'
                    }
                    style={{ fontSize: 14, lineHeight: 1.5 }}
                  >
                    {(() => {
                      // Parse [Evidence Attached: URL] and show image inline
                      const evidenceMatch = msg.content.match(/\[Evidence Attached:\s*(https?:\/\/[^\]]+)\]/);
                      if (evidenceMatch && msg.role === 'user') {
                        const imageUrl = evidenceMatch[1];
                        const textPart = msg.content.replace(/\[Evidence Attached:\s*https?:\/\/[^\]]+\]/, '').trim();
                        return (
                          <>
                            {textPart && <div style={{ marginBottom: 8 }}>{textPart}</div>}
                            <div style={{
                              width: '100%',
                              maxWidth: 180,
                              borderRadius: 8,
                              overflow: 'hidden',
                              border: '1px solid rgba(255,255,255,0.2)',
                            }}>
                              <img
                                src={imageUrl}
                                alt="Uploaded image"
                                style={{ width: '100%', height: 'auto', display: 'block' }}
                              />
                            </div>
                          </>
                        );
                      }
                      return msg.content;
                    })()}
                  </div>

                  {/* Product recommendations */}
                  {msg.products && msg.products.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 10,
                        overflowX: 'auto',
                        paddingBottom: 4,
                        width: '100%',
                        maxWidth: '100%',
                      }}
                      className="scrollbar-hide"
                    >
                      {msg.products.slice(0, 4).map((product) => (
                        <Link
                          key={product.id}
                          href={`/products/${product.id}`}
                          style={{ textDecoration: 'none', flexShrink: 0 }}
                          onClick={() => setIsOpen(false)}
                        >
                          <div
                            style={{
                              width: 110,
                              border: '1px solid #e4e4e7',
                              borderRadius: 12,
                              overflow: 'hidden',
                              background: 'white',
                              transition: 'all 200ms',
                              cursor: 'pointer',
                            }}
                          >
                            <div
                              style={{
                                width: 110,
                                height: 130,
                                background: '#f9fafb',
                                overflow: 'hidden',
                              }}
                            >
                              <img
                                src={product.image_url}
                                alt={product.title}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            </div>
                            <div style={{ padding: '8px 8px 10px' }}>
                              <p
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: '#18181b',
                                  lineHeight: 1.3,
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                  marginBottom: 4,
                                }}
                              >
                                {truncate(product.title, 40)}
                              </p>
                              <p
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                                  WebkitBackgroundClip: 'text',
                                  WebkitTextFillColor: 'transparent',
                                  backgroundClip: 'text',
                                }}
                              >
                                {formatPrice(product.price)}
                              </p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div
                    className="chat-bubble-assistant"
                    style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '12px 16px' }}
                  >
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: '#a1a1aa',
                          animation: 'bounce 1.2s infinite',
                          animationDelay: `${i * 0.2}s`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}


              <div ref={messagesEndRef} />
            </div>
            {/* Input */}
            <div style={{ borderTop: '1px solid #e4e4e7' }}>
              {/* Image preview strip */}
              {selectedImage && (
                <div style={{
                  padding: '8px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: '#fdf4ff',
                  borderBottom: '1px solid #f0abfc',
                }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '2px solid #d946ef',
                    flexShrink: 0,
                  }}>
                    <img
                      src={URL.createObjectURL(selectedImage)}
                      alt="Upload preview"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#9333ea', margin: 0, lineHeight: 1.3 }}>
                      Image attached
                    </p>
                    <p style={{
                      fontSize: 11,
                      color: '#a855f7',
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {selectedImage.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedImage(null)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      border: '1px solid #e4e4e7',
                      background: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      color: '#71717a',
                      flexShrink: 0,
                    }}
                    title="Remove image"
                  >
                    ×
                  </button>
                </div>
              )}
              <div style={{ padding: '12px 16px' }}>
              <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept="image/*"
                  onChange={(e) => setSelectedImage(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isUploading}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: selectedImage ? 'linear-gradient(135deg, #d946ef, #9333ea)' : '#f4f4f5',
                    border: 'none',
                    color: selectedImage ? 'white' : '#71717a',
                    cursor: isLoading || isUploading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 150ms',
                  }}
                  title="Upload Image"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </button>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={selectedImage ? 'What should I find? (e.g. "find similar")' : 'Ask me anything...'}
                  disabled={isLoading || isUploading}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    border: '1.5px solid #e4e4e7',
                    borderRadius: 12,
                    fontSize: 14,
                    outline: 'none',
                    transition: 'border-color 150ms',
                    background: isLoading || isUploading ? '#f9fafb' : 'white',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#d946ef')}
                  onBlur={(e) => (e.target.style.borderColor = '#e4e4e7')}
                />
                <button
                  type="submit"
                  disabled={(!input.trim() && !selectedImage) || isLoading || isUploading}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: (!input.trim() && !selectedImage) || isLoading || isUploading
                      ? '#e4e4e7'
                      : 'linear-gradient(135deg, #d946ef, #9333ea)',
                    border: 'none',
                    color: (!input.trim() && !selectedImage) || isLoading || isUploading ? '#a1a1aa' : 'white',
                    cursor: (!input.trim() && !selectedImage) || isLoading || isUploading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 150ms',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </form>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Floating button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: isOpen
            ? '#18181b'
            : 'linear-gradient(135deg, #d946ef 0%, #9333ea 100%)',
          border: 'none',
          boxShadow: isOpen
            ? '0 8px 24px rgba(0,0,0,0.3)'
            : '0 8px 30px rgba(217,70,239,0.45)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 56,
          transition: 'all 300ms cubic-bezier(0.4,0,0.2,1)',
          transform: isOpen ? 'rotate(90deg)' : 'none',
        }}
        title="Open Style Assistant"
      >
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
      </button>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </>
  );
}
