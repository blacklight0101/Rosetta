-- Synthetic schema for the scan fixtures.
CREATE TABLE CatalogItem (
    Id INT NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    Price DECIMAL(9, 2) NOT NULL
);
GO
CREATE PROCEDURE GetItem @Id INT AS
SELECT Id, Name FROM CatalogItem WHERE Id = @Id;
GO
