namespace Portfolio.Cms.Core.Validation;

/// <summary>
/// Mirrors the two levels scripts/check-content.mjs uses: an error fails the
/// site build, a warning is printed and moves on. The CMS keeps the same split
/// so that what blocks a publish is exactly what would block a build — the
/// alternative is a CMS that cheerfully accepts content the build then rejects.
/// </summary>
public enum Severity
{
    Warning,
    Error,
}

/// <param name="Severity">Whether this blocks a publish.</param>
/// <param name="Where">The thing at fault, e.g. <c>cases.json → "sol-ar"</c>.</param>
/// <param name="Problem">What is wrong, and where possible what to do about it.</param>
/// <param name="Field">Model path of the offending field, so the editor can
/// jump the user to it. Null when the problem is about a file as a whole.</param>
public sealed record ValidationMessage(Severity Severity, string Where, string Problem, string? Field = null)
{
    public override string ToString() => $"{Where}: {Problem}";
}

/// <summary>The outcome of validating a whole <see cref="Json.ContentSet"/>.</summary>
public sealed class ValidationResult
{
    private readonly List<ValidationMessage> _messages = [];

    public IReadOnlyList<ValidationMessage> Messages => _messages;
    public IEnumerable<ValidationMessage> Errors => _messages.Where(m => m.Severity == Severity.Error);
    public IEnumerable<ValidationMessage> Warnings => _messages.Where(m => m.Severity == Severity.Warning);

    /// <summary>True when nothing would fail the site build. Warnings are fine.</summary>
    public bool CanPublish => !Errors.Any();

    public void Error(string where, string problem, string? field = null) =>
        _messages.Add(new ValidationMessage(Severity.Error, where, problem, field));

    public void Warn(string where, string problem, string? field = null) =>
        _messages.Add(new ValidationMessage(Severity.Warning, where, problem, field));

    /// <summary>Adds an error or a warning depending on <paramref name="fatal"/> —
    /// several rules downgrade to a warning for archive cases.</summary>
    public void Add(bool fatal, string where, string problem, string? field = null)
    {
        if (fatal) Error(where, problem, field);
        else Warn(where, problem, field);
    }

    public string Summary() =>
        $"{Errors.Count()} error(s), {Warnings.Count()} warning(s)";
}
