using Portfolio.Cms.Core.Json;

namespace Portfolio.Cms.Tests;

/// <summary>
/// Development aid: renders the content set to a directory so the result can be
/// diffed against the checkout. Skipped unless CMS_DUMP_DIR is set, so it stays
/// out of the way on normal runs.
/// </summary>
public class RenderDump
{
    [Fact]
    public void Dump_rendered_content_when_asked()
    {
        var target = Environment.GetEnvironmentVariable("CMS_DUMP_DIR");
        if (string.IsNullOrWhiteSpace(target)) return;

        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "src", "content")))
            dir = dir.Parent;
        Assert.NotNull(dir);

        foreach (var (relative, text) in ContentSet.LoadFrom(dir.FullName).Serialize())
        {
            var path = Path.Combine(target, relative.Replace('/', Path.DirectorySeparatorChar));
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, text);
        }
    }
}
