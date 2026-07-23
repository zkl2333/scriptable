const fontFamily = (font) => {
  if (font.family === 'rounded') return 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
  if (font.family === 'monospaced') return 'ui-monospace, SFMono-Regular, Menlo, monospace';
  return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
};

export const resolveColor = (color, scheme = 'light') => {
  if (!color) return 'transparent';
  if (color.kind === 'dynamic-color') return resolveColor(color[scheme], scheme);
  const alpha = color.alpha ?? 1;
  const hex = color.hex || '#000000';
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const raw = match[1].length === 3 ? match[1].split('').map((part) => part + part).join('') : match[1];
  const red = Number.parseInt(raw.slice(0, 2), 16);
  const green = Number.parseInt(raw.slice(2, 4), 16);
  const blue = Number.parseInt(raw.slice(4, 6), 16);
  return `rgb(${red} ${green} ${blue} / ${alpha})`;
};

const gradientToCss = (gradient, scheme) => {
  const dx = gradient.endPoint.x - gradient.startPoint.x;
  const dy = gradient.endPoint.y - gradient.startPoint.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  const colors = gradient.colors.map((color, index) => {
    const location = gradient.locations[index] ?? index / Math.max(1, gradient.colors.length - 1);
    return `${resolveColor(color, scheme)} ${Math.round(location * 100)}%`;
  });
  return `linear-gradient(${angle}deg, ${colors.join(', ')})`;
};

const applyBoxStyles = (element, node, scheme) => {
  const [top, leading, bottom, trailing] = node.padding || [0, 0, 0, 0];
  element.style.padding = `${top}px ${trailing}px ${bottom}px ${leading}px`;
  element.style.gap = `${node.spacing || 0}px`;
  element.style.borderRadius = `${node.cornerRadius || 0}px`;
  element.style.borderWidth = `${node.borderWidth || 0}px`;
  element.style.borderStyle = node.borderWidth ? 'solid' : '';
  element.style.borderColor = resolveColor(node.borderColor, scheme);
  if (node.backgroundGradient) element.style.background = gradientToCss(node.backgroundGradient, scheme);
  else element.style.backgroundColor = resolveColor(node.backgroundColor, scheme);
  if (node.size?.width > 0) element.style.width = `${node.size.width}px`;
  if (node.size?.height > 0) element.style.height = `${node.size.height}px`;
};

const applyCanvasPath = (context, commands) => {
  context.beginPath();
  for (const command of commands) {
    if (command.type === 'rect') context.rect(command.rect.x, command.rect.y, command.rect.width, command.rect.height);
    if (command.type === 'rounded-rect') {
      context.roundRect(
        command.rect.x,
        command.rect.y,
        command.rect.width,
        command.rect.height,
        [command.cornerWidth, command.cornerHeight]
      );
    }
    if (command.type === 'ellipse') {
      context.ellipse(
        command.rect.x + command.rect.width / 2,
        command.rect.y + command.rect.height / 2,
        command.rect.width / 2,
        command.rect.height / 2,
        0,
        0,
        Math.PI * 2
      );
    }
    if (command.type === 'move') context.moveTo(command.point.x, command.point.y);
    if (command.type === 'line') context.lineTo(command.point.x, command.point.y);
    if (command.type === 'quad') {
      context.quadraticCurveTo(command.controlPoint.x, command.controlPoint.y, command.point.x, command.point.y);
    }
    if (command.type === 'curve') {
      context.bezierCurveTo(
        command.controlPoint1.x,
        command.controlPoint1.y,
        command.controlPoint2.x,
        command.controlPoint2.y,
        command.point.x,
        command.point.y
      );
    }
    if (command.type === 'close') context.closePath();
  }
};

const canvasFont = (font) => `${font.italic ? 'italic ' : ''}${font.weight} ${font.size}px ${fontFamily(font)}`;

const renderCanvas = (source, scheme) => {
  const canvas = document.createElement('canvas');
  const scale = source.respectScreenScale ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.max(1, Math.round(source.size.width * scale));
  canvas.height = Math.max(1, Math.round(source.size.height * scale));
  canvas.style.width = `${source.size.width}px`;
  canvas.style.height = `${source.size.height}px`;
  const context = canvas.getContext('2d');
  context.scale(scale, scale);
  for (const command of source.commands) {
    if (command.type === 'fill-rect') {
      context.fillStyle = resolveColor(command.color, scheme);
      context.fillRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height);
    }
    if (command.type === 'stroke-rect') {
      context.strokeStyle = resolveColor(command.color, scheme);
      context.lineWidth = command.lineWidth;
      context.strokeRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height);
    }
    if (command.type === 'fill-path') {
      applyCanvasPath(context, command.path);
      context.fillStyle = resolveColor(command.color, scheme);
      context.fill();
    }
    if (command.type === 'stroke-path') {
      applyCanvasPath(context, command.path);
      context.strokeStyle = resolveColor(command.color, scheme);
      context.lineWidth = command.lineWidth;
      context.stroke();
    }
    if (command.type === 'text' || command.type === 'text-rect') {
      context.fillStyle = resolveColor(command.color, scheme);
      context.font = canvasFont(command.font);
      context.textAlign = command.alignment;
      context.textBaseline = 'top';
      const point = command.type === 'text' ? command.point : {
        x: command.rect.x + (command.alignment === 'center' ? command.rect.width / 2 : command.alignment === 'right' ? command.rect.width : 0),
        y: command.rect.y,
      };
      context.fillText(command.text, point.x, point.y);
    }
  }
  return canvas;
};

const formatDate = (node, now) => {
  const date = new Date(node.date);
  if (node.dateStyle === 'time') return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date);
  if (node.dateStyle === 'relative') {
    const seconds = Math.round((date - now) / 1000);
    const formatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });
    if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
    if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), 'minute');
    if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), 'hour');
    return formatter.format(Math.round(seconds / 86400), 'day');
  }
  if (node.dateStyle === 'timer') {
    const seconds = Math.max(0, Math.floor((date - now) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, '0')).join(':');
  }
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(date);
};

const renderText = (node, scheme, now) => {
  const element = document.createElement('div');
  element.className = 'widget-text';
  element.textContent = node.type === 'date' ? formatDate(node, now) : node.text;
  element.style.fontFamily = fontFamily(node.font);
  element.style.fontSize = `${node.font.size}px`;
  element.style.fontWeight = node.font.weight;
  element.style.fontStyle = node.font.italic ? 'italic' : 'normal';
  element.style.color = resolveColor(node.textColor, scheme);
  element.style.opacity = node.opacity ?? 1;
  element.style.textAlign = node.alignment;
  if (node.lineLimit > 0) {
    element.style.display = '-webkit-box';
    element.style.webkitBoxOrient = 'vertical';
    element.style.webkitLineClamp = node.lineLimit;
  }
  return element;
};

const symbolLabel = (name) => {
  const labels = {
    'quote.opening': '"',
    'quote.bubble.fill': 'Q',
    calendar: 'C',
    airplane: 'A',
    clock: 'T',
  };
  return labels[name] || 'SF';
};

const renderImage = (node, scheme) => {
  const frame = document.createElement('div');
  frame.className = 'widget-image';
  frame.style.opacity = node.opacity ?? 1;
  frame.style.borderRadius = `${node.cornerRadius || 0}px`;
  frame.style.alignSelf = node.alignment;
  if (node.imageSize?.width > 0) frame.style.width = `${node.imageSize.width}px`;
  if (node.imageSize?.height > 0) frame.style.height = `${node.imageSize.height}px`;
  if (node.image?.kind === 'canvas') frame.append(renderCanvas(node.image, scheme));
  else if (node.image?.kind === 'sf-symbol') {
    const symbol = document.createElement('span');
    symbol.className = 'sf-symbol';
    symbol.textContent = symbolLabel(node.image.name);
    symbol.title = node.image.name;
    symbol.style.color = resolveColor(node.tintColor, scheme);
    symbol.style.fontSize = `${node.image.font?.size || 14}px`;
    frame.append(symbol);
  } else if (typeof node.image === 'string') {
    const image = document.createElement('img');
    image.src = node.image;
    image.alt = '';
    image.style.objectFit = node.contentMode === 'fill' ? 'cover' : 'contain';
    frame.append(image);
  } else {
    frame.classList.add('missing-image');
    frame.textContent = 'IMG';
  }
  return frame;
};

const renderNode = (node, options) => {
  const { scheme, now } = options;
  if (node.type === 'text' || node.type === 'date') return renderText(node, scheme, now);
  if (node.type === 'image') return renderImage(node, scheme);
  if (node.type === 'spacer') {
    const spacer = document.createElement('div');
    spacer.className = 'widget-spacer';
    if (node.length === null) spacer.classList.add('flexible');
    else spacer.style.flexBasis = `${node.length}px`;
    return spacer;
  }
  const element = document.createElement('div');
  element.className = node.type === 'list-widget' ? 'widget-root widget-container' : 'widget-stack widget-container';
  element.dataset.nodeId = node.id;
  element.style.flexDirection = node.layout === 'vertical' ? 'column' : 'row';
  element.style.alignItems = node.alignment;
  applyBoxStyles(element, node, scheme);
  for (const child of node.children) element.append(renderNode(child, options));
  return element;
};

export const renderWidget = (widget, { family, scheme = 'light', now = new Date(), size }) => {
  const frame = document.createElement('div');
  frame.className = `widget-frame family-${family} scheme-${scheme}`;
  frame.style.width = `${size.width}px`;
  frame.style.height = `${size.height}px`;
  frame.append(renderNode(widget, { scheme, now }));
  return frame;
};
