using EduMonitorAI.Integration;
using Microsoft.Extensions.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHealthChecks();
builder.Services.AddIntegration();
builder.Services.AddOpenApi();

var app = builder.Build();
app.UseApiErrors();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapGet("/health", async (HealthCheckService healthChecks, CancellationToken cancellationToken) =>
    {
        var report = await healthChecks.CheckHealthAsync(cancellationToken);
        var statusCode = report.Status == HealthStatus.Unhealthy
            ? StatusCodes.Status503ServiceUnavailable
            : StatusCodes.Status200OK;

        return Results.Text(report.Status.ToString(), "text/plain", statusCode: statusCode);
    })
    .WithName("GetHealth")
    .WithSummary("Comprobar la disponibilidad del proceso")
    .WithDescription("Comprobación de vida; no valida Moodle, persistencia ni permisos.")
    .Produces<string>(StatusCodes.Status200OK, "text/plain")
    .Produces<string>(StatusCodes.Status503ServiceUnavailable, "text/plain");

app.MapGet("/api/access/me", async (HttpContext context, MoodleClient moodle, CancellationToken ct) =>
 Results.Ok(await moodle.Authorize(context.Token(), null, ct)));
app.MapGet("/api/access/courses/{courseId:long}", async (long courseId, HttpContext context, MoodleClient moodle, CancellationToken ct) =>
 Results.Ok(await moodle.Authorize(context.Token(), courseId, ct)));
app.Run();

public partial class Program { }
