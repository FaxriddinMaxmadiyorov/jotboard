require "test_helper"

class ElementTest < ActiveSupport::TestCase
  setup { @page = create_board.pages.first }

  test "later elements stack above earlier ones" do
    first = @page.elements.create!(uid: "a", kind: "rect", data: { "type" => "Rect" })
    second = @page.elements.create!(uid: "b", kind: "path", data: { "type" => "Path" })
    assert_operator second.z, :>, first.z
  end

  test "rejects unknown kinds and oversized data" do
    assert_not @page.elements.new(uid: "a", kind: "video", data: {}).valid?
    huge = { "path" => "M" * (Element::MAX_DATA_BYTES + 1) }
    assert_not @page.elements.new(uid: "b", kind: "path", data: huge).valid?
  end

  test "uids are unique per page" do
    @page.elements.create!(uid: "a", kind: "rect", data: {})
    assert_raises(ActiveRecord::RecordNotUnique) { @page.elements.create!(uid: "a", kind: "rect", data: {}) }
  end
end
