import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import { checkUrlSafety } from '@/lib/urlSafety';

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // SSRF guard: this endpoint fetches whatever URL the client sends,
    // server-side. Without this check a pasted URL could reach internal
    // services (cloud metadata, localhost, the app's own database) that
    // this server can see but the client never could.
    const safety = await checkUrlSafety(url);
    if (!safety.safe) {
      return NextResponse.json({ error: `URL not allowed: ${safety.reason}` }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      next: { revalidate: 3600 }
    });

    if (!response.ok) {
      return NextResponse.json({ title: '', description: '', type: 'WEBSITE' });
    }

    const html = await response.text();

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : '';

    title = title
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i) ||
                      html.match(/<meta[^>]+content="([^"]*)"[^>]+name="description"/i) ||
                      html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i);
    const description = descMatch ? descMatch[1].trim() : '';

    let type = 'WEBSITE';
    if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com')) {
      type = 'VIDEO';
    } else if (url.includes('github.com') || url.includes('gitlab.com')) {
      type = 'WEBSITE';
    } else if (url.includes('medium.com') || url.includes('dev.to') || url.includes('blog.')) {
      type = 'ARTICLE';
    } else if (url.includes('coursera.org') || url.includes('udemy.com') || url.includes('edx.org')) {
      type = 'COURSE';
    } else if (url.endsWith('.pdf')) {
      type = 'PAPER';
    }

    return NextResponse.json({ title, description, type });
  } catch (e) {
    console.error('Failed to scrape URL details:', e);
    return NextResponse.json({ title: '', description: '', type: 'WEBSITE' });
  }
}
