using System.Collections.Generic;

namespace ShopWeb.Services
{
    public class CatalogService
    {
        private const string ListSql = "SELECT Id, Name, Price FROM CatalogItem ORDER BY Name";
        private const string Message = "Select an item to see its details";

        public IList<string> List()
        {
            var sql = "UPDATE CatalogItem SET Stock = Stock - 1 WHERE Id = @id";
            var verbatim = @"INSERT INTO AuditLog (Message, At)
                VALUES (@message, GETDATE())";
            return new List<string> { ListSql, Message, sql, verbatim };
        }
    }
}
