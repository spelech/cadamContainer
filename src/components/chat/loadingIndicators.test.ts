import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { AssistantLoadingBubble } from '@/components/chat/ChatSession';
import { ConversationView } from '@/views/ConversationView';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ConversationContext } from '@/contexts/ConversationContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Conversation } from '@shared/types';
import type { TreeNode } from '@shared/Tree';
import type { ChatMessage } from '@/lib/aiMessages';

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

    it('hides generating pill when not streaming and hides View 3D button when key is absent', () => {
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
          mobilePreviewKey: null,
          isChatStreaming: false,
        }),
      );

      assert.ok(
        !html.includes('data-testid="mobile-generating-pill"'),
        'hides generating pill when not streaming',
      );
      assert.ok(
        !html.includes('data-testid="mobile-view-3d-button"'),
        'hides view 3d button when no preview key',
      );
    });
  });

  describe('MessageBubble Loading Fallback & Boundary Conditions', () => {
    const dummyConv: Conversation = {
      id: 'c1',
      user_id: 'u1',
      title: 'Test',
      type: 'parametric',
      privacy: 'private',
      current_message_leaf_id: null,
      settings: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    function createMockTreeNode(msg: {
      id: string;
      role: 'assistant';
      parts: { type: 'text'; text: string }[];
      metadata: Record<string, unknown>;
    }): TreeNode<ChatMessage> {
      return {
        ...msg,
        parent_message_id: null,
        children: [],
        parent: null,
        siblings: [],
      } as unknown as TreeNode<ChatMessage>;
    }

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    function renderMessage(
      msg: TreeNode<ChatMessage>,
      isLoading: boolean,
      isLastMessage: boolean,
    ) {
      return ReactDOMServer.renderToStaticMarkup(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(
            ConversationContext.Provider,
            { value: { conversation: dummyConv } },
            React.createElement(MessageBubble, {
              message: msg,
              isLoading,
              isLastMessage,
            }),
          ),
        ),
      );
    }

    it('renders fallback loading bubble when assistant message has empty text parts while streaming', () => {
      const emptyMsg = createMockTreeNode({
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: '   ' }],
        metadata: {},
      });

      const html = renderMessage(emptyMsg, true, true);

      assert.ok(
        html.includes('Generating with Adam...'),
        'shows loading fallback when parts have no visible text',
      );
      assert.ok(html.includes('animate-bounce'), 'shows bouncing dots');
    });

    it('suppresses fallback loading bubble when isLoading is false even if parts are empty', () => {
      const emptyMsg = createMockTreeNode({
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: '' }],
        metadata: {},
      });

      const html = renderMessage(emptyMsg, false, true);

      assert.ok(
        !html.includes('Generating with Adam...'),
        'does not show loading fallback when not loading',
      );
    });

    it('suppresses fallback loading bubble when not the last message', () => {
      const emptyMsg = createMockTreeNode({
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: '' }],
        metadata: {},
      });

      const html = renderMessage(emptyMsg, true, false);

      assert.ok(
        !html.includes('Generating with Adam...'),
        'does not show loading fallback on older messages',
      );
    });

    it('suppresses fallback loading bubble when text has arrived', () => {
      const populatedMsg = createMockTreeNode({
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Here is your model.' }],
        metadata: {},
      });

      const html = renderMessage(populatedMsg, true, true);

      assert.ok(
        !html.includes('Generating with Adam...'),
        'suppresses loading fallback when message content is visible',
      );
      assert.ok(html.includes('Here is your model.'), 'renders message text');
    });
  });
});
