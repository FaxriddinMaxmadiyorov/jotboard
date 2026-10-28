module ApplicationHelper
  # Small stroke icons (24x24 grid, drawn for this app).
  ICONS = {
    select: '<path d="M5 3l14 7-6.2 1.8L10.5 18z"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11.5V4a1.5 1.5 0 0 1 3 0v7.5"/><path d="M14 11.5V5.5a1.5 1.5 0 0 1 3 0V14"/><path d="M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.6-2.2L4.3 14.6a1.6 1.6 0 0 1 2.4-2.1L8 14"/>',
    pen: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
    highlighter: '<path d="M9 15l-2.5 2.5L4 20h5l1.5-1.5"/><path d="M8.5 14.5l9-9a2.1 2.1 0 0 1 3 3l-9 9z"/><path d="M8.5 14.5l3 3"/>',
    eraser: '<path d="M7 20h12"/><path d="M5.6 15.6l8.5-8.5a2 2 0 0 1 2.8 0l2 2a2 2 0 0 1 0 2.8L12.2 18.6a2 2 0 0 1-1.4.6H8.6a2 2 0 0 1-1.4-.6l-1.6-1.6a2 2 0 0 1 0-1.4z"/><path d="M9.5 11.5l4.5 4.5"/>',
    line: '<path d="M5 19L19 5"/>',
    arrow: '<path d="M5 19L19 5"/><path d="M10 5h9v9"/>',
    rect: '<rect x="4" y="5" width="16" height="14" rx="2"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="7"/>',
    text: '<path d="M5 6V4.5h14V6"/><path d="M12 4.5v15"/><path d="M9 19.5h6"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    share: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18.5 14.2A6.5 6.5 0 0 1 21.5 20"/>',
    download: '<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>',
    fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4"/><path d="M15 4h4a1 1 0 0 1 1 1v4"/><path d="M20 15v4a1 1 0 0 1-1 1h-4"/><path d="M9 20H5a1 1 0 0 1-1-1v-4"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    pages: '<rect x="5" y="3" width="12" height="15" rx="2"/><path d="M8 21h9a2 2 0 0 0 2-2V7"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
  }.freeze

  def icon(name, size: 20, **attrs)
    content_tag(:svg, ICONS.fetch(name).html_safe, viewBox: "0 0 24 24", width: size, height: size, fill: "none",
      stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round",
      "aria-hidden": "true", focusable: "false", **attrs)
  end

  def avatar(nickname, color, size: 32, **attrs)
    initials = nickname.to_s.split(/\s+/).first(2).map { |w| w[0] }.join.upcase.presence || "?"
    content_tag(:span, initials, class: ["avatar", attrs.delete(:class)].compact.join(" "),
      style: "--avatar: #{color}; --size: #{size}px", title: nickname, **attrs)
  end

  def role_label(role)
    { "viewer" => "Can view", "artist" => "Can draw", "editor" => "Can draw and edit pages", "manager" => "Full access" }.fetch(role)
  end

  def time_ago(time) = "#{time_ago_in_words(time)} ago"
end
