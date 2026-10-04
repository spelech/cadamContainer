import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { AssistantLoadingBubble } from '@/components/chat/ChatSession';
import { ConversationView } from '@/views/ConversationView';

describe('Generation Loading Indicators & Mobile Feedback', () => {
  describe('AssistantLoadingBubble', () => {
    it('renders parametric loading state with Adam branding and pulsing dots', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(AssistantLoadingBubble, { type: 'parametric' }),
      );

      assert.ok(
        html.includes('data-testid="assistant-loading-bubble"'),
        'contains test id',
      );
      assert.ok(html.includes('Adam'), 'contains Adam name');
      assert.ok(
        html.includes('Generating with Adam...'),
        'contains parametric generation copy',
      );
      assert.ok(
        html.includes('animate-bounce'),
        'contains animated pulsing dots',
      );
    });

    it('renders creative/mesh loading state with 3D mesh copy', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(AssistantLoadingBubble, { type: 'creative' }),
      );

      assert.ok(
        html.includes('data-testid="assistant-loading-bubble"'),
        'contains test id',
      );
      assert.ok(
        html.includes('Generating 3D mesh...'),
        'contains 3D mesh generation copy',
      );
      assert.ok(
        html.includes('animate-bounce'),
        'contains animated pulsing dots',
      );
    });

    it('defaults to parametric copy when type is undefined', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(AssistantLoadingBubble, {}),
      );

      assert.ok(
        html.includes('Generating with Adam...'),
        'defaults to Adam generation label',
      );
    });
  });

  describe('ConversationView Mobile Indicators', () => {
    const originalWindow = globalThis.window;

    afterEach(() => {
      globalThis.window = originalWindow;
    });

    it('renders mobile generating pill when streaming on mobile viewport', () => {
      // Mock mobile matchMedia (< 1024px)
      globalThis.window = {
        matchMedia: (_query: string) => ({
          matches: true,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
        innerWidth: 375,
        innerHeight: 667,
      } as unknown as Window & typeof globalThis;

      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ConversationView, {
          chatPanelSlot: React.createElement('div', null, 'Chat Content'),
          previewSlot: React.createElement('div', null, 'Desktop Preview'),
          parametersSlot: null,
          hasParameters: false,
          isChatStreaming: true,
        }),
      );

      assert.ok(
        html.includes('data-testid="mobile-generating-pill"'),
        'shows mobile generating pill',
      );
      assert.ok(
        html.includes('Adam is generating...'),
        'shows generating message',
      );
    });

    it('renders mobile View 3D button when preview model exists and sheet is closed', () => {
      globalThis.window = {
        matchMedia: (_query: string) => ({
          matches: true,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
        innerWidth: 375,
        innerHeight: 667,
      } as unknown as Window & typeof globalThis;

      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ConversationView, {
          chatPanelSlot: React.createElement('div', null, 'Chat Content'),
          previewSlot: React.createElement('div', null, 'Desktop Preview'),
          parametersSlot: null,
          hasParameters: false,
          mobilePreviewKey: 'mesh:msg-1:mesh-123',
          isChatStreaming: false,
        }),
      );

      assert.ok(
        html.includes('data-testid="mobile-view-3d-button"'),
        'shows mobile View 3D button',
      );
      assert.ok(html.includes('View 3D'), 'contains button label');
    });

    it('does not render mobile floating pill on desktop viewports', () => {
      // Mock desktop matchMedia (> 1024px)
      globalThis.window = {
        matchMedia: (_query: string) => ({
          matches: false,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
        innerWidth: 1440,
        innerHeight: 900,
      } as unknown as Window & typeof globalThis;

      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ConversationView, {
          chatPanelSlot: React.createElement('div', null, 'Chat Content'),
          previewSlot: React.createElement('div', null, 'Desktop Preview'),
          parametersSlot: null,
          hasParameters: false,
          isChatStreaming: true,
        }),
      );

      assert.ok(
        !html.includes('data-testid="mobile-generating-pill"'),
        'does not show mobile pill on desktop',
      );
      assert.ok(
        !html.includes('data-testid="mobile-view-3d-button"'),
        'does not show mobile button on desktop',
      );
    });
  });
});
