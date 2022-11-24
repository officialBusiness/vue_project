/**
 * Creates a Globally unique identifier (GUID) string.  A GUID is 128 bits long, and can guarantee uniqueness across space and time.
 *
 * @see <a href="http://www.ietf.org/rfc/rfc4122.txt">RFC 4122 A Universally Unique IDentifier (UUID) URN Namespace</a>
 *
 * @example
 * this.guid = createGuid();
 */
export default function createGuid() {
    // http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}