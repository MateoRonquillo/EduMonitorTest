using EduMonitorAI.Integration;
using Microsoft.Extensions.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHealthChecks();
builder.Services.AddIntegration();
builder.Services.AddScoped<AcademicData.API.Infrastructure.AcademicStore>();
builder.Services.AddHttpClient("integration", client => client.Timeout = TimeSpan.FromMinutes(2))
 .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddOpenApi();

var app = builder.Build();
app.UseApiErrors();
app.Use(async (context, next) =>
{
    try { await next(context); }
    catch (MySqlConnector.MySqlException) { throw new ApiFailure(503, "database_operation_failed"); }
});

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

app.MapPost("/api/courses/{courseId:long}/sync", async (long courseId, HttpContext context, MoodleClient moodle,
 IHttpClientFactory clients, IConfiguration config, AcademicData.API.Infrastructure.AcademicStore store, CancellationToken ct) =>
{
    var token = context.Token();
    var access = await moodle.Authorize(token, courseId, ct);
    try
    {
        using var request = new HttpRequestMessage(HttpMethod.Get,
         (config["Services:MoodleIntegration"] ?? "http://localhost:5101").TrimEnd('/') + $"/api/courses/{courseId}/snapshot");
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        HttpResponseMessage response;
        try { response = await clients.CreateClient("integration").SendAsync(request, ct); }
        catch (HttpRequestException) { throw new ApiFailure(502, "integration_unavailable"); }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new ApiFailure(504, "integration_timeout"); }
        using (response)
        {
            if (!response.IsSuccessStatusCode) throw new ApiFailure((int)response.StatusCode, "synchronization_failed");
            var snapshot = await response.Content.ReadFromJsonAsync<Snapshot>(ct) ?? throw new ApiFailure(502, "invalid_snapshot");
            if (snapshot.CourseId != courseId) throw new ApiFailure(502, "invalid_snapshot");
            await store.Save(snapshot, access.UserId, ct);
            return Results.Ok(new { snapshot.CourseId, snapshot.SyncedAt, snapshot.Source, Students = snapshot.Students.Length, Grades = snapshot.Grades.Length });
        }
    }
    catch (ApiFailure failure)
    {
        try { await store.RecordFailure(courseId, access.UserId, failure.Message, ct); }
        catch (Exception auditError) when (auditError is ApiFailure or MySqlConnector.MySqlException)
        { app.Logger.LogWarning("No fue posible registrar la sincronización fallida del curso {CourseId}", courseId); }
        throw;
    }
});
app.MapGet("/api/courses/{courseId:long}/data", async (long courseId, HttpContext context, MoodleClient moodle,
 AcademicData.API.Infrastructure.AcademicStore store, CancellationToken ct) =>
{
    await moodle.Authorize(context.Token(), courseId, ct);
    var snapshot = await store.Read(courseId, ct);
    return snapshot is null ? Results.NotFound() : Results.Ok(snapshot);
});
app.Run();

public partial class Program { }
