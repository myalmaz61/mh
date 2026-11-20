#!/usr/bin/env python3
"""Optional public feed cache for GitHub Pages. Standard library only.

Usage: python3 scripts/rss-public-cache.py rss-public-feeds.json _site/rss-public-cache.json
No server, personal credentials, private API keys or external dependencies.
Feed sources and downloaded article metadata become publicly accessible.
"""
import json
import sys
import os
import re
import socket
import ipaddress
import urllib.request
from urllib.parse import urlparse, urljoin
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

MAX_XML = 1_500_000
USER_AGENT = 'MyHubPersonalRSS/0.7 (personal noncommercial RSS reader)'


def check_url(url):
    if not isinstance(url, str) or len(url)>2048:
        raise ValueError('Invalid URL')
    p = urlparse(url)
    if p.scheme != 'https' or not p.hostname or p.username or p.password:
        raise ValueError('Only public HTTPS URLs without credentials are accepted')
    if p.hostname.lower() == 'localhost' or p.hostname.endswith('.local'):
        raise ValueError('Local host is not a public feed')
    # Protect the GitHub-hosted runner from accidental private-address access.
    for record in socket.getaddrinfo(p.hostname, 443, type=socket.SOCK_STREAM):
        address = ipaddress.ip_address(record[4][0])
        if not address.is_global:
            raise ValueError('Feed resolves to a non-public address')
    return url


class StrictRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def get_xml(url):
    check_url(url)
    opener = urllib.request.build_opener(StrictRedirect())
    req = urllib.request.Request(url, headers={
        'User-Agent': USER_AGENT,
        'Accept': 'application/rss+xml,application/atom+xml,application/xml,text/xml'
    })
    with opener.open(req, timeout=14) as res:
        raw = res.read(MAX_XML+1)
    if len(raw)>MAX_XML or b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError('XML exceeds size cap or contains unsupported DTD/entity')
    return ET.fromstring(raw)


def children(node, name):
    return [c for c in node if c.tag.rsplit('}',1)[-1].lower() == name.lower()]


def child_text(node, name):
    found = children(node, name)
    return ''.join(found[0].itertext()).strip() if found else ''


def short(text, length):
    return re.sub(r'\s+', ' ', re.sub('<[^>]+>', ' ', str(text or ''))).strip()[:length]


def safe_article_url(url, base):
    try:
        absolute=urljoin(base,url)
        p=urlparse(absolute)
        if p.scheme == 'https' and p.hostname and not p.username and not p.password:
            return absolute[:2048]
    except Exception:
        pass
    return ''


def date_iso(value):
    if not value:
        return ''
    try:
        dt = parsedate_to_datetime(value)
    except (ValueError, TypeError):
        try:
            dt = datetime.fromisoformat(value.replace('Z','+00:00'))
        except ValueError:
            return ''
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace('+00:00','Z')


def parse_source(root, source):
    tag = root.tag.rsplit('}',1)[-1].lower()
    is_atom = tag == 'feed'
    channel = root if is_atom else next(iter(children(root,'channel')),None)
    if channel is None:
        raise ValueError('RSS 2.0 or Atom feed expected')
    nodes = children(channel,'entry' if is_atom else 'item')
    articles=[]
    seen=set()
    for n in nodes[:120]:
        title=short(child_text(n,'title'),350)
        if is_atom:
            links=[el for el in children(n,'link') if el.get('rel') in (None,'alternate')]
            href=links[0].get('href','') if links else ''
        else:
            href=child_text(n,'link')
        href=safe_article_url(href,source)
        guid=child_text(n,'id' if is_atom else 'guid') or href or title
        if not title or not guid or guid in seen:
            continue
        seen.add(guid)
        summary=short(child_text(n,'summary' if is_atom else 'description') or child_text(n,'content'),1500)
        date=date_iso(child_text(n,'updated' if is_atom else 'pubDate') or child_text(n,'published') or child_text(n,'date'))
        articles.append({'title':title,'url':href,'guid':guid[:2048],'summary':summary,'publishedAt':date})
        if len(articles)>=100:
            break
    return articles


def main(config_path, target_path):
    with open(config_path,encoding='utf-8') as f:
        config=json.load(f)
    if not isinstance(config.get('feeds'),list) or len(config['feeds'])>40:
        raise ValueError('Config must contain a list of at most 40 public feeds')
    collected=[]
    for item in config['feeds']:
        try:
            url=check_url(item if isinstance(item,str) else item.get('url'))
            print('Fetching:',url)
            articles=parse_source(get_xml(url),url)
            collected.append({'url':url,'articles':articles})
            print('Fetched articles:',len(articles))
        except Exception as ex:
            print('Skipping feed:',str(ex),file=sys.stderr)
    os.makedirs(os.path.dirname(target_path) or '.',exist_ok=True)
    with open(target_path,'w',encoding='utf-8') as file:
        json.dump({'format':1,'generatedAt':datetime.now(timezone.utc).isoformat(),'feeds':collected},file,ensure_ascii=False,separators=(',',':'))
    print('Created public RSS cache:', target_path)


if __name__=='__main__':
    if len(sys.argv)!=3:
        raise SystemExit('Usage: rss-public-cache.py CONFIG OUTPUT')
    main(sys.argv[1],sys.argv[2])
