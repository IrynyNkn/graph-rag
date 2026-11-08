import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { closeOpenMarkers } from './answer-markdown';
import { AnswerText } from './AnswerText';

describe('AnswerText', () => {
  afterEach(cleanup);

  it('draws lists, bold, code and tables', () => {
    const text = [
      '- **Alice** manages',
      '- `search` runs',
      '',
      '| Team | Lead |',
      '| --- | --- |',
      '| Search | Owen |',
    ].join('\n');

    const { container } = render(<AnswerText text={text} />);

    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('Alice').tagName).toBe('STRONG');
    expect(screen.getByText('search').tagName).toBe('CODE');
    expect(screen.getByRole('cell', { name: 'Owen' })).toBeTruthy();
  });

  it('never fetches an image from what it was given', () => {
    const { container } = render(<AnswerText text="Look ![alt](http://example.test/x.png)" />);

    expect(container.querySelector('img')).toBeNull();
  });

  it('opens a link away from the conversation', () => {
    render(<AnswerText text="See [the page](https://example.test)." />);

    const link = screen.getByRole<HTMLAnchorElement>('link', { name: 'the page' });

    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noreferrer');
  });

  it('has no words of its own and no caret once it is saved', () => {
    const { container } = render(<AnswerText text="Alice does." />);

    expect(container.querySelector('.word')).toBeNull();
    expect(container.querySelector('.answer-caret')).toBeNull();
  });

  describe('while it streams', () => {
    it('gives every word its own element, at any depth', () => {
      const { container } = render(<AnswerText text={'Two words\n\n- in **a list**'} isLive />);

      const words = [...container.querySelectorAll('.word')].map((word) => word.textContent);

      expect(words).toEqual(['Two', 'words', 'in', 'a', 'list']);
    });

    it('keeps code in one piece', () => {
      const { container } = render(<AnswerText text={'Run `a b` now\n\n```\nc  d\n```'} isLive />);

      expect(container.querySelector('code .word')).toBeNull();
      expect(container.querySelector('pre')?.textContent).toContain('c  d');
    });

    it('keeps the caret at the end of the text, inside its block', () => {
      const { container, rerender } = render(<AnswerText text="Some words" isLive />);

      expect(container.querySelector('p .answer-caret')).toBeTruthy();

      rerender(<AnswerText text={'A list\n\n- one\n- two'} isLive />);

      expect(container.querySelector('li:last-child .answer-caret')).toBeTruthy();
      expect(container.querySelectorAll('.answer-caret')).toHaveLength(1);
    });

    it('keeps the elements of the words it already has as text arrives', () => {
      const { container, rerender } = render(<AnswerText text="Alice manages" isLive />);
      const [first] = container.querySelectorAll('.word');

      rerender(<AnswerText text="Alice manages the team" isLive />);

      expect(container.querySelectorAll('.word')[0]).toBe(first);
      expect(container.querySelectorAll('.word')).toHaveLength(4);
    });
  });
});

describe('closeOpenMarkers', () => {
  it('closes a pair of asterisks left open', () => {
    expect(closeOpenMarkers('It is **Ali')).toBe('It is **Ali**');
    expect(closeOpenMarkers('It is **Alice ')).toBe('It is **Alice**');
  });

  it('leaves out an opening pair with nothing after it yet', () => {
    expect(closeOpenMarkers('It is **')).toBe('It is ');
  });

  it('leaves out half of a pair that is still arriving', () => {
    expect(closeOpenMarkers('It is *')).toBe('It is ');
  });

  it('leaves closed pairs alone', () => {
    expect(closeOpenMarkers('It is **Alice** who')).toBe('It is **Alice** who');
    expect(closeOpenMarkers('')).toBe('');
  });
});
